import nodemailer from 'nodemailer';
import { db, Account, Campaign, TaskLog } from './db';

// 变量替换辅助
export function replaceVariables(text: string, vars: Record<string, string>): string {
  let res = text;
  for (const [k, v] of Object.entries(vars)) {
    res = res.split(`{${k}}`).join(v || '');
    res = res.split(`{{${k}}}`).join(v || '');
  }
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const dateTimeStr = now.toLocaleString();
  res = res.split('{date}').join(dateStr);
  res = res.split('{datetime}').join(dateTimeStr);
  return res;
}

// 创建 nodemailer transporter
function createTransporter(account: Account) {
  return nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.port === 465 || account.use_ssl,
    auth: {
      user: account.username,
      pass: account.password,
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 15000,
  });
}

// 单封发送
export async function sendSingleMail(
  account: Account,
  toEmail: string,
  toName: string,
  subject: string,
  bodyHtml: string
) {
  const transporter = createTransporter(account);
  const from = account.from_name
    ? `"${account.from_name}" <${account.from_email}>`
    : account.from_email;
  const to = toName ? `"${toName}" <${toEmail}>` : toEmail;

  return await transporter.sendMail({
    from,
    to,
    subject,
    html: bodyHtml,
  });
}

// 测试连通性
export async function testSmtp(account: Account, testTo: string) {
  const now = new Date().toLocaleString();
  const subject = `【连通性测试】Mail Hub 桌面端 SMTP 验证成功 - ${now}`;
  const html = `
    <div style="font-family: sans-serif; padding: 20px; line-height: 1.6;">
      <h2 style="color: #52c41a;">恭喜！SMTP 邮箱连通性测试成功！</h2>
      <p>这是一封来自 <strong>Mail Hub 本地桌面应用</strong> 的自动测试邮件。</p>
      <ul>
        <li><strong>SMTP 服务器：</strong>${account.host}:${account.port}</li>
        <li><strong>发件邮箱：</strong>${account.from_email}</li>
        <li><strong>认证账号：</strong>${account.username}</li>
        <li><strong>测试时间：</strong>${now}</li>
      </ul>
      <p style="color: #888;">此发件箱已就绪，可随时用于单发或多邮箱分摊群发。</p>
    </div>
  `;
  return await sendSingleMail(account, testTo, '测试收件人', subject, html);
}

// 群发任务运行控制
const activeCampaigns = new Map<number, boolean>();

export function pauseCampaign(campaignId: number) {
  activeCampaigns.delete(campaignId);
  const data = db.getData();
  const camp = data.campaigns.find((c) => c.id === campaignId);
  if (camp) {
    camp.status = 'paused';
    db.save();
  }
}

export async function runCampaignDispatcher(campaignId: number) {
  if (activeCampaigns.has(campaignId)) return;
  activeCampaigns.set(campaignId, true);

  const data = db.getData();
  const camp = data.campaigns.find((c) => c.id === campaignId);
  if (!camp) return;

  camp.status = 'running';
  db.save();

  const todayStr = new Date().toISOString().slice(0, 10);
  let accountIndex = 0;

  try {
    while (activeCampaigns.get(campaignId)) {
      // 提取下一条 pending 记录
      const pendingLogs = data.task_logs.filter(
        (log) => log.campaign_id === campaignId && log.status === 'pending'
      );

      if (pendingLogs.length === 0) {
        camp.status = 'completed';
        camp.finished_at = new Date().toISOString();
        db.save();
        break;
      }

      const item = pendingLogs[0];

      // 挑选发件箱 (Round-Robin 轮询与配额熔断)
      const usableAccounts = data.accounts.filter(
        (a) => camp.account_ids.includes(a.id) && a.status === 'active'
      );

      if (usableAccounts.length === 0) {
        camp.status = 'failed';
        db.save();
        break;
      }

      let chosenAcc: Account | null = null;
      for (let i = 0; i < usableAccounts.length; i++) {
        const candidate = usableAccounts[accountIndex % usableAccounts.length];
        accountIndex++;

        // 跨天重置
        if (candidate.last_reset_date !== todayStr) {
          candidate.last_reset_date = todayStr;
          candidate.sent_today = 0;
        }

        // 检查配额
        if (candidate.daily_limit > 0 && candidate.sent_today >= candidate.daily_limit) {
          continue;
        }

        chosenAcc = candidate;
        break;
      }

      if (!chosenAcc) {
        console.warn(`[Campaign ${campaignId}] 所有勾选发件箱均已达到单日上限，自动暂停`);
        camp.status = 'paused';
        db.save();
        break;
      }

      // 执行个性化替换与发送
      const vars = { name: item.to_name, email: item.to_email };
      const personalizedSubject = replaceVariables(camp.subject, vars);
      const personalizedBody = replaceVariables(camp.body_html, vars);

      item.status = 'sending';
      item.account_id = chosenAcc.id;
      item.from_email = chosenAcc.from_email;
      item.subject = personalizedSubject;
      db.save();

      try {
        await sendSingleMail(
          chosenAcc,
          item.to_email,
          item.to_name,
          personalizedSubject,
          personalizedBody
        );

        item.status = 'success';
        item.sent_at = new Date().toISOString();
        item.error_msg = '';
        camp.success_count++;
        chosenAcc.sent_today++;
      } catch (err: any) {
        item.status = 'failed';
        item.sent_at = new Date().toISOString();
        item.error_msg = err.message || '发送失败';
        camp.fail_count++;
      }
      db.save();

      // 防封随机延时
      const minI = Math.max(1, camp.min_interval || 2);
      const maxI = Math.max(minI, camp.max_interval || 5);
      const sleepSec = Math.floor(Math.random() * (maxI - minI + 1)) + minI;

      await new Promise((resolve) => setTimeout(resolve, sleepSec * 1000));
    }
  } finally {
    activeCampaigns.delete(campaignId);
  }
}
