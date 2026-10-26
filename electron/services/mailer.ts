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
  // 端口 465 采用直接 SSL/TLS (secure: true)；端口 587/25 采用 STARTTLS 协商升级 (secure: false)
  const isSecure = account.port === 465 ? true : (account.port === 587 ? false : !!account.use_ssl);
  return nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: isSecure,
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

// 单封完全独立的发送 (100% 独立信件，绝对不包含其他任何人的地址)
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
  try {
    return await sendSingleMail(account, testTo, '测试收件人', subject, html);
  } catch (err: any) {
    let msg = err.message || 'SMTP 测试失败';
    const isGmail = (account.host && account.host.includes('gmail')) || (account.from_email && account.from_email.includes('@gmail.com'));
    if (
      isGmail &&
      (msg.includes('535') ||
        msg.includes('Username and Password not accepted') ||
        msg.includes('Invalid login') ||
        msg.includes('BadCredentials'))
    ) {
      msg = 'Gmail 认证失败：Google 要求使用 16 位「应用专用密码」(App Password) 代替普通密码登录第三方客户端。请先在 Google 账号中开启两步验证，再访问 https://myaccount.google.com/apppasswords 生成应用专用密码填入。';
    }
    throw new Error(msg);
  }
}

// 群发任务运行控制
const activeCampaigns = new Map<number, boolean>();

export function pauseCampaign(campaignId: number) {
  activeCampaigns.delete(campaignId);
  const data = db.getData();
  const camp = data.campaigns.find((c) => c.id === campaignId);
  if (camp) {
    camp.status = 'paused';
    camp.current_delay_info = '已由用户暂停';
    db.save();
  }
}

/**
 * 核心调度引擎：群发逐封独立发送 (Round-Robin 多发件箱智能轮换 + 抖动防封控制)
 */
export async function runCampaignDispatcher(campaignId: number) {
  if (activeCampaigns.has(campaignId)) return;
  activeCampaigns.set(campaignId, true);

  const data = db.getData();
  const camp = data.campaigns.find((c) => c.id === campaignId);
  if (!camp) return;

  camp.status = 'running';
  if (!camp.started_at) {
    camp.started_at = new Date().toISOString();
  }
  if (camp.send_mode === 'time_budget' && camp.target_duration_minutes && !camp.target_finish_time) {
    camp.target_finish_time = new Date(Date.now() + camp.target_duration_minutes * 60 * 1000).toISOString();
  }
  db.save();

  const todayStr = new Date().toISOString().slice(0, 10);
  let accountIndex = 0;
  let batchSentCounter = 0; // 批次计数器

  try {
    while (activeCampaigns.get(campaignId)) {
      // 提取下一封待发送记录
      const pendingLogs = data.task_logs.filter(
        (log) => log.campaign_id === campaignId && log.status === 'pending'
      );

      // 全部发完，任务标记完成
      if (pendingLogs.length === 0) {
        camp.status = 'completed';
        camp.finished_at = new Date().toISOString();
        camp.current_sending_to = '';
        camp.current_sending_from = '';
        camp.current_delay_info = '全部邮件已逐封发送完毕';
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
        camp.current_delay_info = '无可用发件箱';
        db.save();
        break;
      }

      let chosenAcc: Account | null = null;
      for (let i = 0; i < usableAccounts.length; i++) {
        const candidate = usableAccounts[accountIndex % usableAccounts.length];
        accountIndex++;

        // 跨天自动重置
        if (candidate.last_reset_date !== todayStr) {
          candidate.last_reset_date = todayStr;
          candidate.sent_today = 0;
        }

        // 检查单日配额
        if (candidate.daily_limit > 0 && candidate.sent_today >= candidate.daily_limit) {
          continue; // 达到限额，跳到下一个
        }

        chosenAcc = candidate;
        break;
      }

      if (!chosenAcc) {
        camp.status = 'paused';
        camp.current_delay_info = '所有勾选发件箱均达到今日发送上限，任务已自动挂起';
        db.save();
        break;
      }

      // 执行个性化变量替换 (每一封都是独立的定制内容)
      const vars = { name: item.to_name, email: item.to_email };
      const personalizedSubject = replaceVariables(camp.subject, vars);
      const personalizedBody = replaceVariables(camp.body_html, vars);

      // 实时标记正在发送的目标与使用的邮箱
      item.status = 'sending';
      item.account_id = chosenAcc.id;
      item.from_email = chosenAcc.from_email;
      item.subject = personalizedSubject;

      camp.current_sending_to = item.to_email;
      camp.current_sending_from = chosenAcc.from_email;
      camp.current_delay_info = `正在通过 [${chosenAcc.name}] 向 ${item.to_email} 投递中...`;
      db.save();

      // 执行真实的单封独立投递
      const maxRetries = camp.max_retries || 0;
      let sendSuccess = false;
      let lastErrMsg = '';

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          await sendSingleMail(
            chosenAcc,
            item.to_email,
            item.to_name,
            personalizedSubject,
            personalizedBody
          );
          sendSuccess = true;
          break;
        } catch (err: any) {
          lastErrMsg = err.message || '发送失败';
          // 如果允许重试且还有可用账号，换下一个发件箱重试
          if (attempt < maxRetries && usableAccounts.length > 1) {
            const nextAcc = usableAccounts[accountIndex % usableAccounts.length];
            accountIndex++;
            chosenAcc = nextAcc;
            item.account_id = chosenAcc.id;
            item.from_email = chosenAcc.from_email;
          }
        }
      }

      if (sendSuccess) {
        item.status = 'success';
        item.sent_at = new Date().toISOString();
        item.error_msg = '';
        camp.success_count++;
        chosenAcc.sent_today++;
        batchSentCounter++;
      } else {
        item.status = 'failed';
        item.sent_at = new Date().toISOString();
        item.error_msg = lastErrMsg;
        camp.fail_count++;
      }

      // 实时归档到「已发送 / 发件箱」列表
      data.sent_mails.unshift({
        id: db.getNextId('sent_mails'),
        account_id: chosenAcc.id,
        account_name: chosenAcc.name,
        from_email: chosenAcc.from_email,
        to_email: item.to_email,
        to_name: item.to_name,
        subject: personalizedSubject,
        body_html: personalizedBody,
        sent_type: 'campaign',
        campaign_id: camp.id,
        campaign_title: camp.title,
        status: sendSuccess ? 'success' : 'failed',
        error_msg: sendSuccess ? '' : lastErrMsg,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });

      db.save();

      // 检查任务是否在发送期间被用户暂停
      if (!activeCampaigns.get(campaignId)) break;

      // 批次休息机制 (例如每发 10 封额外休息 30 秒)
      if (
        camp.enable_batch_rest &&
        camp.batch_size &&
        camp.batch_size > 0 &&
        batchSentCounter >= camp.batch_size
      ) {
        batchSentCounter = 0;
        const restSec = camp.batch_rest_sec || 30;
        camp.current_delay_info = `已连续发送 ${camp.batch_size} 封，触发批次深度防封保护，休眠中 (还剩 ${restSec} 秒)...`;
        db.save();

        for (let s = restSec; s > 0; s--) {
          if (!activeCampaigns.get(campaignId)) break;
          camp.current_delay_info = `批次休息中，将在 ${s} 秒后继续发送下一封...`;
          db.save();
          await new Promise((r) => setTimeout(r, 1000));
        }
      } else {
        let jitterSec: number;

        if (camp.send_mode === 'time_budget' && camp.target_finish_time) {
          // 限时匀速平摊算法
          const pendingLogsCount = data.task_logs.filter(
            (log) => log.campaign_id === campaignId && log.status === 'pending'
          ).length;

          if (pendingLogsCount > 0) {
            const nowMs = Date.now();
            const targetFinishMs = new Date(camp.target_finish_time).getTime();
            const remainingMs = Math.max(0, targetFinishMs - nowMs);
            const remainingSec = remainingMs / 1000;

            // 单封期望基础间隔 = 剩余秒数 / 剩余封数
            const baseInterval = Math.max(1, remainingSec / pendingLogsCount);
            // 动态上下浮动 20% 防封防风控
            const jitterMin = Math.max(1, +(baseInterval * 0.8).toFixed(1));
            const jitterMax = Math.max(jitterMin + 0.2, +(baseInterval * 1.2).toFixed(1));
            jitterSec = +(jitterMin + Math.random() * (jitterMax - jitterMin)).toFixed(1);

            const remMinStr = (remainingSec / 60).toFixed(1);
            camp.current_delay_info = `限时匀速发信中：剩余 ${pendingLogsCount} 封 / 剩余 ${remMinStr} 分钟，动态间隔休眠 ${jitterSec} 秒...`;
          } else {
            jitterSec = 1;
          }
        } else {
          // 常规单封之间的随机抖动延时 (防封抖动控制)
          const minI = Math.max(1, camp.min_interval || 2);
          const maxI = Math.max(minI, camp.max_interval || 5);
          jitterSec = +(minI + Math.random() * (maxI - minI)).toFixed(1);

          camp.current_delay_info = `上一封已完成，随机抖动休眠 ${jitterSec} 秒后发送下一封...`;
        }

        db.save();

        const sleepMs = jitterSec * 1000;
        const step = 500;
        let elapsed = 0;
        while (elapsed < sleepMs) {
          if (!activeCampaigns.get(campaignId)) break;
          await new Promise((r) => setTimeout(r, Math.min(step, sleepMs - elapsed)));
          elapsed += step;
        }
      }
    }
  } finally {
    activeCampaigns.delete(campaignId);
    camp.current_sending_to = '';
    camp.current_sending_from = '';
    if (camp.status !== 'completed' && camp.status !== 'paused') {
      camp.current_delay_info = '';
    }
    db.save();
  }
}
