import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { db, Account, InboundMail } from './db';

function createImapClient(account: Account) {
  let host = account.imap_host;
  if (!host) {
    if (account.host.includes('qq.com')) host = 'imap.qq.com';
    else if (account.host.includes('163.com')) host = 'imap.163.com';
    else if (account.host.includes('gmail.com')) host = 'imap.gmail.com';
    else if (account.host.includes('aliyun') || account.host.includes('mxhichina.com')) host = 'imap.mxhichina.com';
    else host = account.host.replace('smtp.', 'imap.');
  }

  const port = account.imap_port || 993;
  const user = account.imap_username || account.username;
  const pass = account.imap_password || account.password || '';

  return new ImapFlow({
    host,
    port,
    secure: port === 993 || account.imap_use_ssl,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    logger: false,
  });
}

// 测试 IMAP 登录连通性
export async function testImap(account: Account) {
  const client = createImapClient(account);
  try {
    await client.connect();
    return true;
  } finally {
    try {
      await client.logout();
    } catch {}
  }
}

// 同步收件箱
export async function syncInbound(account: Account, limit = 30): Promise<number> {
  const client = createImapClient(account);
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    let newCount = 0;

    try {
      const data = db.getData();
      // 获取最近 limit 封邮件
      const mailbox = client.mailbox;
      const totalCount = mailbox && typeof mailbox !== 'boolean' ? mailbox.exists : 0;
      const startSeq = Math.max(1, totalCount - limit + 1);
      const messages = client.fetch({ seq: `*:${startSeq}` }, {
        envelope: true,
        source: true,
        uid: true,
      });

      for await (const msg of messages) {
        const uidStr = String(msg.uid);
        // 避免重复入库
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

        data.inbound_mails.push(newMail);
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
