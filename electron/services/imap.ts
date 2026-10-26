import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { db, Account, InboundMail } from './db';
import { getFreshGoogleAccessToken } from './google-auth';

async function createImapClient(account: Account) {
  let host = account.imap_host;
  if (!host) {
    if (account.host.includes('qq.com')) host = 'imap.qq.com';
    else if (account.host.includes('163.com')) host = 'imap.163.com';
    else if (account.host.includes('gmail.com')) host = 'imap.gmail.com';
    else if (account.host.includes('aliyun') || account.host.includes('mxhichina.com')) host = 'imap.mxhichina.com';
    else host = account.host.replace('smtp.', 'imap.');
  }

  const port = account.imap_port || 993;
  let authConfig: any;

  if (account.auth_type === 'oauth2') {
    const accessToken = await getFreshGoogleAccessToken(account);
    authConfig = {
      user: account.from_email,
      accessToken,
    };
  } else {
    const user = account.imap_username || account.username;
    const pass = account.imap_password || account.password || '';
    authConfig = { user, pass };
  }

  return new ImapFlow({
    host,
    port,
    secure: port === 993 || account.imap_use_ssl,
    auth: authConfig,
    tls: {
      rejectUnauthorized: false,
    },
    clientInfo: {
      name: 'Thunderbird',
      version: '115.0',
    },
    logger: false,
  });
}

// 测试 IMAP 登录连通性
export async function testImap(account: Account) {
  const client = await createImapClient(account);
  try {
    await client.connect();
    return true;
  } catch (err: any) {
    let msg = err.message || 'IMAP 测试连接失败';
    const isGmail =
      (account.imap_host && account.imap_host.includes('gmail')) ||
      account.host.includes('gmail') ||
      account.from_email.includes('@gmail.com');
    if (
      isGmail &&
      (msg.includes('AUTHENTICATIONFAILED') ||
        msg.includes('Invalid credentials') ||
        msg.includes('Username and Password not accepted') ||
        msg.includes('535'))
    ) {
      msg =
        'Gmail IMAP 登录失败：请确认 1) Gmail 网页端「所有设置 - 转发和 POP/IMAP」中已开启 IMAP；2) 密码使用的是 16 位 Google「应用专用密码」(App Password) 而非普通登录密码。';
    }
    throw new Error(msg);
  } finally {
    try {
      await client.logout();
    } catch {}
  }
}

// 同步收件箱最新邮件
export async function syncInbound(account: Account, limit = 30): Promise<number> {
  const client = await createImapClient(account);
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    let newCount = 0;

    try {
      const data = db.getData();
      const mailbox = client.mailbox;
      const totalCount = mailbox && typeof mailbox !== 'boolean' ? mailbox.exists : 0;

      if (totalCount === 0) {
        account.last_sync_at = new Date().toISOString();
        db.save();
        return 0;
      }

      // 正确的 IMAP 序列范围：最新的 limit 封邮件，例如 4000:*
      const startSeq = Math.max(1, totalCount - limit + 1);
      const range = `${startSeq}:*`;

      const messages = client.fetch(range, {
        envelope: true,
        source: true,
        uid: true,
      });

      for await (const msg of messages) {
        const uidStr = String(msg.uid);
        // 本地排重
        const exists = data.inbound_mails.some(
          (m) => m.account_id === account.id && m.uid === uidStr
        );
        if (exists) continue;

        let bodyHtml = '';
        let bodyText = '';
        if (msg.source) {
          try {
            const parsed = await simpleParser(msg.source);
            bodyHtml = parsed.html || '';
            bodyText = parsed.text || '';
          } catch {
            bodyText = '(解析邮件正文异常)';
          }
        }

        const env = msg.envelope;
        const fromAddr = env?.from?.[0]?.address || '';
        const fromName = env?.from?.[0]?.name || '';
        const toAddr = env?.to?.[0]?.address || account.from_email;
        const subject = env?.subject || '(无主题)';
        const date = env?.date ? env.date.toISOString() : new Date().toISOString();
        const messageId = env?.messageId || '';

        const newMail: InboundMail = {
          id: db.getNextId('inbound_mails'),
          account_id: account.id,
          account_name: account.name,
          account_email: account.from_email,
          uid: uidStr,
          message_id: messageId,
          from_address: fromAddr,
          from_name: fromName,
          to_address: toAddr,
          subject,
          body_html: bodyHtml,
          body_text: bodyText,
          date,
          is_read: false,
          created_at: new Date().toISOString(),
        };

        // 新邮件插入列表
        data.inbound_mails.unshift(newMail);
        newCount++;
      }

      account.last_sync_at = new Date().toISOString();
      db.save();
    } finally {
      lock.release();
    }

    return newCount;
  } finally {
    try {
      await client.logout();
    } catch {}
  }
}
