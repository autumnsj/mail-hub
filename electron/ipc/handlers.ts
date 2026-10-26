import { ipcMain } from 'electron';
import { db, Account, Contact, ContactGroup, Template, Campaign, TaskLog } from '../services/db';
import { sendSingleMail, testSmtp, runCampaignDispatcher, pauseCampaign } from '../services/mailer';
import { testImap, syncInbound } from '../services/imap';

export function registerIpcHandlers() {
  const data = db.getData();

  // 1. 发件箱 / 账号管理
  ipcMain.handle('accounts:list', async () => {
    return data.accounts;
  });

  ipcMain.handle('accounts:save', async (_, acc: Partial<Account>) => {
    if (acc.id) {
      const idx = data.accounts.findIndex((a) => a.id === acc.id);
      if (idx !== -1) {
        data.accounts[idx] = { ...data.accounts[idx], ...acc };
      }
    } else {
      const newAcc: Account = {
        id: db.getNextId('accounts'),
        name: acc.name || '',
        host: acc.host || '',
        port: acc.port || 465,
        username: acc.username || '',
        password: acc.password || '',
        from_email: acc.from_email || '',
        from_name: acc.from_name || '',
        use_ssl: acc.use_ssl !== false,
        daily_limit: acc.daily_limit || 0,
        sent_today: 0,
        last_reset_date: new Date().toISOString().slice(0, 10),
        status: 'active',
        last_error: '',
        enable_inbound: acc.enable_inbound !== false,
        imap_host: acc.imap_host || '',
        imap_port: acc.imap_port || 993,
        imap_use_ssl: acc.imap_use_ssl !== false,
        imap_username: acc.imap_username || '',
        imap_password: acc.imap_password || '',
        created_at: new Date().toISOString(),
      };
      data.accounts.push(newAcc);
    }
    db.save();
    return true;
  });

  ipcMain.handle('accounts:delete', async (_, id: number) => {
    data.accounts = data.accounts.filter((a) => a.id !== id);
    db.save();
    return true;
  });

  ipcMain.handle('accounts:test-smtp', async (_, { account, testTo }) => {
    return await testSmtp(account, testTo);
  });

  ipcMain.handle('accounts:test-imap', async (_, account) => {
    return await testImap(account);
  });

  // 2. 单发邮件
  ipcMain.handle('send:single', async (_, { accountId, toEmail, toName, subject, bodyHtml }) => {
    const acc = data.accounts.find((a) => a.id === accountId);
    if (!acc) throw new Error('发件箱未找到');

    await sendSingleMail(acc, toEmail, toName, subject, bodyHtml);

    // 记录单发日志
    const logItem: TaskLog = {
      id: db.getNextId('task_logs'),
      campaign_id: 0,
      account_id: acc.id,
      from_email: acc.from_email,
      to_email: toEmail,
      to_name: toName || '',
      subject,
      status: 'success',
      error_msg: '',
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    data.task_logs.push(logItem);
    acc.sent_today++;
    db.save();
    return true;
  });

  // 3. 多邮箱分摊群发任务
  ipcMain.handle('campaigns:create', async (_, payload: {
    title: string;
    subject: string;
    body_html: string;
    account_ids: number[];
    group_ids?: number[];
    recipients_text?: string;
    min_interval: number;
    max_interval: number;
    enable_batch_rest?: boolean;
    batch_size?: number;
    batch_rest_sec?: number;
    max_retries?: number;
    auto_start: boolean;
  }) => {
    const recipientMap = new Map<string, string>();

    // 提取分组收件人
    if (payload.group_ids && payload.group_ids.length > 0) {
      data.contacts
        .filter((c) => payload.group_ids!.includes(c.group_id))
        .forEach((c) => recipientMap.set(c.email.toLowerCase(), c.name));
    }

    // 提取文本框批量粘贴
    if (payload.recipients_text) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const lines = payload.recipients_text.split('\n');
      for (const line of lines) {
        const matches = line.match(emailRegex);
        if (matches && matches[0]) {
          const email = matches[0].toLowerCase();
          let name = '';
          if (line.includes('<') && line.includes('>')) {
            name = line.slice(0, line.indexOf('<')).trim();
          } else if (line.includes(',')) {
            const parts = line.split(',');
            name = (parts[0] !== email ? parts[0] : parts[1] || '').trim();
          }
          if (!recipientMap.has(email)) {
            recipientMap.set(email, name);
          }
        }
      }
    }

    if (recipientMap.size === 0) {
      throw new Error('未检测到任何有效收件人');
    }

    const campaignId = db.getNextId('campaigns');
    const newCamp: Campaign = {
      id: campaignId,
      title: payload.title,
      subject: payload.subject,
      body_html: payload.body_html,
      account_ids: payload.account_ids,
      status: 'draft',
      total_count: recipientMap.size,
      success_count: 0,
      fail_count: 0,
      min_interval: payload.min_interval || 2,
      max_interval: payload.max_interval || 5,
      enable_batch_rest: payload.enable_batch_rest,
      batch_size: payload.batch_size,
      batch_rest_sec: payload.batch_rest_sec,
      max_retries: payload.max_retries || 0,
      created_at: new Date().toISOString(),
    };
    data.campaigns.unshift(newCamp);

    // 生成逐条发送日志 (严格一封一封单独投递)
    for (const [email, name] of recipientMap.entries()) {
      data.task_logs.push({
        id: db.getNextId('task_logs'),
        campaign_id: campaignId,
        account_id: 0,
        from_email: '',
        to_email: email,
        to_name: name,
        subject: payload.subject,
        status: 'pending',
        error_msg: '',
        created_at: new Date().toISOString(),
      });
    }

    db.save();

    if (payload.auto_start) {
      runCampaignDispatcher(campaignId);
    }

    return newCamp;
  });

  // 动态修改正在进行或已保存任务的速率与抖动配置
  ipcMain.handle('campaigns:update-config', async (_, payload: {
    id: number;
    min_interval: number;
    max_interval: number;
    enable_batch_rest?: boolean;
    batch_size?: number;
    batch_rest_sec?: number;
  }) => {
    const camp = data.campaigns.find((c) => c.id === payload.id);
    if (camp) {
      camp.min_interval = payload.min_interval;
      camp.max_interval = payload.max_interval;
      camp.enable_batch_rest = payload.enable_batch_rest;
      camp.batch_size = payload.batch_size;
      camp.batch_rest_sec = payload.batch_rest_sec;
      db.save();
    }
    return true;
  });

  ipcMain.handle('campaigns:list', async () => {
    return data.campaigns;
  });

  ipcMain.handle('campaigns:start', async (_, id: number) => {
    runCampaignDispatcher(id);
    return true;
  });

  ipcMain.handle('campaigns:pause', async (_, id: number) => {
    pauseCampaign(id);
    return true;
  });

  ipcMain.handle('campaigns:delete', async (_, id: number) => {
    pauseCampaign(id);
    data.campaigns = data.campaigns.filter((c) => c.id !== id);
    data.task_logs = data.task_logs.filter((l) => l.campaign_id !== id);
    db.save();
    return true;
  });

  ipcMain.handle('campaigns:logs', async (_, { campaignId, status }) => {
    return data.task_logs.filter((l) => {
      if (l.campaign_id !== campaignId) return false;
      if (status && status !== 'all' && l.status !== status) return false;
      return true;
    });
  });

  // 4. 收件箱 (IMAP)
  ipcMain.handle('inbound:list', async (_, { accountId, isRead, keyword }) => {
    let list = data.inbound_mails.filter((m) => {
      if (accountId && accountId !== 0 && m.account_id !== accountId) return false;
      if (isRead === 'unread' && m.is_read) return false;
      if (isRead === 'read' && !m.is_read) return false;
      if (keyword) {
        const kw = keyword.toLowerCase();
        const sub = (m.subject || '').toLowerCase();
        const from = (m.from_address || '').toLowerCase();
        if (!sub.includes(kw) && !from.includes(kw)) return false;
      }
      return true;
    });

    // 严格按邮件时间从新到旧倒序排！
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return list;
  });

  ipcMain.handle('inbound:get', async (_, id: number) => {
    return data.inbound_mails.find((m) => m.id === id) || null;
  });

  ipcMain.handle('inbound:sync', async (_, accountId?: number) => {
    let targets = data.accounts.filter((a) => a.enable_inbound !== false && a.status === 'active');
    if (accountId && accountId !== 0) {
      targets = targets.filter((a) => a.id === accountId);
    }
    if (targets.length === 0) {
      throw new Error('未找到已启用收信的有效邮箱 (请确认发件箱已启用收信功能)');
    }

    let totalNew = 0;
    const errors: string[] = [];
    for (const acc of targets) {
      try {
        const cnt = await syncInbound(acc, 50);
        totalNew += cnt;
      } catch (err: any) {
        errors.push(`${acc.from_email}: ${err.message}`);
      }
    }

    if (errors.length > 0 && totalNew === 0) {
      throw new Error(`收信异常: ${errors.join('; ')}`);
    }

    return { totalNew, errors };
  });

  ipcMain.handle('inbound:read', async (_, { id, isRead }) => {
    const item = data.inbound_mails.find((m) => m.id === id);
    if (item) {
      item.is_read = isRead;
      db.save();
    }
    return true;
  });

  ipcMain.handle('inbound:delete', async (_, id: number) => {
    data.inbound_mails = data.inbound_mails.filter((m) => m.id !== id);
    db.save();
    return true;
  });

  // 5. 联系人与分组
  ipcMain.handle('groups:list', async () => {
    return data.groups.map((g) => ({
      ...g,
      contacts_count: data.contacts.filter((c) => c.group_id === g.id).length,
    }));
  });

  ipcMain.handle('groups:save', async (_, g: Partial<ContactGroup>) => {
    const newGroup: ContactGroup = {
      id: db.getNextId('groups'),
      name: g.name || '',
      description: g.description || '',
      created_at: new Date().toISOString(),
    };
    data.groups.push(newGroup);
    db.save();
    return newGroup;
  });

  ipcMain.handle('groups:delete', async (_, id: number) => {
    data.groups = data.groups.filter((g) => g.id !== id);
    data.contacts.forEach((c) => {
      if (c.group_id === id) c.group_id = 0;
    });
    db.save();
    return true;
  });

  ipcMain.handle('contacts:list', async (_, { groupId, keyword }) => {
    return data.contacts.filter((c) => {
      if (groupId && groupId !== 0 && c.group_id !== groupId) return false;
      if (keyword) {
        const kw = keyword.toLowerCase();
        if (!c.email.toLowerCase().includes(kw) && !(c.name || '').toLowerCase().includes(kw)) {
          return false;
        }
      }
      return true;
    });
  });

  ipcMain.handle('contacts:save', async (_, c: Partial<Contact>) => {
    const item: Contact = {
      id: db.getNextId('contacts'),
      group_id: c.group_id || 0,
      email: c.email || '',
      name: c.name || '',
      company: c.company || '',
      created_at: new Date().toISOString(),
    };
    data.contacts.push(item);
    db.save();
    return item;
  });

  ipcMain.handle('contacts:batch', async (_, { groupId, content }) => {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const lines = content.split('\n');
    let count = 0;

    for (const line of lines) {
      const match = line.match(emailRegex);
      if (match && match[0]) {
        const email = match[0].toLowerCase();
        let name = '';
        if (line.includes('<') && line.includes('>')) {
          name = line.slice(0, line.indexOf('<')).trim();
        } else if (line.includes(',')) {
          const parts = line.split(',');
          name = (parts[0] !== email ? parts[0] : parts[1] || '').trim();
        }

        const exists = data.contacts.some((c) => c.email.toLowerCase() === email);
        if (!exists) {
          data.contacts.push({
            id: db.getNextId('contacts'),
            group_id: groupId || 0,
            email,
            name,
            company: '',
            created_at: new Date().toISOString(),
          });
          count++;
        }
      }
    }
    db.save();
    return count;
  });

  ipcMain.handle('contacts:delete', async (_, id: number) => {
    data.contacts = data.contacts.filter((c) => c.id !== id);
    db.save();
    return true;
  });

  ipcMain.handle('contacts:clear', async (_, groupId?: number) => {
    if (groupId && groupId !== 0) {
      data.contacts = data.contacts.filter((c) => c.group_id !== groupId);
    } else {
      data.contacts = [];
    }
    db.save();
    return true;
  });

  // 6. 邮件模板
  ipcMain.handle('templates:list', async () => {
    return data.templates;
  });

  ipcMain.handle('templates:save', async (_, t: Partial<Template>) => {
    if (t.id) {
      const idx = data.templates.findIndex((item) => item.id === t.id);
      if (idx !== -1) {
        data.templates[idx] = { ...data.templates[idx], ...t };
      }
    } else {
      data.templates.push({
        id: db.getNextId('templates'),
        title: t.title || '',
        subject: t.subject || '',
        body_html: t.body_html || '',
        created_at: new Date().toISOString(),
      });
    }
    db.save();
    return true;
  });

  ipcMain.handle('templates:delete', async (_, id: number) => {
    data.templates = data.templates.filter((t) => t.id !== id);
    db.save();
    return true;
  });

  // 7. 控制台统计数据
  ipcMain.handle('stats:get', async () => {
    const successCount = data.task_logs.filter((l) => l.status === 'success').length;
    const failCount = data.task_logs.filter((l) => l.status === 'failed').length;
    return {
      accounts_count: data.accounts.length,
      contacts_count: data.contacts.length,
      campaigns_count: data.campaigns.length,
      total_success: successCount,
      total_fail: failCount,
    };
  });
}
