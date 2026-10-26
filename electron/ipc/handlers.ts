import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import { db, Account, Contact, ContactGroup, Template, Campaign, TaskLog, SentMail, DraftMail } from '../services/db';
import { sendSingleMail, testSmtp, runCampaignDispatcher, pauseCampaign } from '../services/mailer';
import { testImap, syncInbound } from '../services/imap';
import { startGoogleOAuthFlow } from '../services/google-auth';

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

  // Google OAuth 2.0 网页跳转授权登录
  ipcMain.handle('accounts:google-oauth', async (_, { clientId, clientSecret }) => {
    const authResult = await startGoogleOAuthFlow(clientId, clientSecret);

    // 检查是否已存在同名或同 email 的账号
    let acc = data.accounts.find((a) => a.from_email.toLowerCase() === authResult.email.toLowerCase());
    if (acc) {
      acc.auth_type = 'oauth2';
      acc.oauth_provider = 'google';
      acc.client_id = clientId;
      acc.client_secret = clientSecret;
      acc.access_token = authResult.access_token;
      acc.refresh_token = authResult.refresh_token;
      acc.token_expires_at = Date.now() + (authResult.expires_in || 3600) * 1000;
      acc.host = 'smtp.gmail.com';
      acc.port = 465;
      acc.use_ssl = true;
      acc.imap_host = 'imap.gmail.com';
      acc.imap_port = 993;
      acc.imap_use_ssl = true;
      acc.enable_inbound = true;
      acc.status = 'active';
      acc.last_error = '';
    } else {
      acc = {
        id: db.getNextId('accounts'),
        name: `Gmail (${authResult.name || authResult.email})`,
        host: 'smtp.gmail.com',
        port: 465,
        username: authResult.email,
        from_email: authResult.email,
        from_name: authResult.name || authResult.email,
        use_ssl: true,
        daily_limit: 500,
        sent_today: 0,
        last_reset_date: new Date().toISOString().slice(0, 10),
        status: 'active',
        last_error: '',
        enable_inbound: true,
        imap_host: 'imap.gmail.com',
        imap_port: 993,
        imap_use_ssl: true,
        auth_type: 'oauth2',
        oauth_provider: 'google',
        client_id: clientId,
        client_secret: clientSecret,
        access_token: authResult.access_token,
        refresh_token: authResult.refresh_token,
        token_expires_at: Date.now() + (authResult.expires_in || 3600) * 1000,
        created_at: new Date().toISOString(),
      };
      data.accounts.push(acc);
    }

    db.save();
    return acc;
  });

  // 2. 单发邮件
  ipcMain.handle('send:single', async (_, { accountId, toEmail, toName, subject, bodyHtml }) => {
    const acc = data.accounts.find((a) => a.id === accountId);
    if (!acc) throw new Error('发件箱未找到');

    await sendSingleMail(acc, toEmail, toName, subject, bodyHtml);

    // 记录单发任务流水与已发送发件箱归档
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

    // 归档到已发送邮件 (发件箱)
    data.sent_mails.unshift({
      id: db.getNextId('sent_mails'),
      account_id: acc.id,
      account_name: acc.name,
      from_email: acc.from_email,
      to_email: toEmail,
      to_name: toName || '',
      subject,
      body_html: bodyHtml,
      sent_type: 'single',
      status: 'success',
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

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
    send_mode?: 'interval' | 'time_budget';
    target_duration_minutes?: number;
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
      send_mode: payload.send_mode || 'interval',
      target_duration_minutes: payload.target_duration_minutes,
      target_finish_time:
        payload.send_mode === 'time_budget' && payload.target_duration_minutes
          ? new Date(Date.now() + payload.target_duration_minutes * 60 * 1000).toISOString()
          : undefined,
      started_at: payload.auto_start ? new Date().toISOString() : undefined,
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
    send_mode?: 'interval' | 'time_budget';
    target_duration_minutes?: number;
    min_interval: number;
    max_interval: number;
    enable_batch_rest?: boolean;
    batch_size?: number;
    batch_rest_sec?: number;
  }) => {
    const camp = data.campaigns.find((c) => c.id === payload.id);
    if (camp) {
      camp.send_mode = payload.send_mode || 'interval';
      camp.target_duration_minutes = payload.target_duration_minutes;
      if (camp.send_mode === 'time_budget' && payload.target_duration_minutes) {
        camp.target_finish_time = new Date(Date.now() + payload.target_duration_minutes * 60 * 1000).toISOString();
      }
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
    const camp = data.campaigns.find((c) => c.id === id);
    if (camp && camp.send_mode === 'time_budget' && camp.target_duration_minutes) {
      const now = Date.now();
      if (!camp.target_finish_time || new Date(camp.target_finish_time).getTime() <= now) {
        camp.target_finish_time = new Date(now + camp.target_duration_minutes * 60 * 1000).toISOString();
      }
      db.save();
    }
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

  // 4.1 发件箱 (已发送邮件 Sent Mails)
  ipcMain.handle('sent:list', async (_, params: {
    accountId?: number;
    sentType?: 'all' | 'single' | 'campaign';
    status?: 'all' | 'success' | 'failed';
    keyword?: string;
  } = {}) => {
    const { accountId, sentType, status, keyword } = params;
    let list = (data.sent_mails || []).filter((m) => {
      if (accountId && accountId !== 0 && m.account_id !== accountId) return false;
      if (sentType && sentType !== 'all' && m.sent_type !== sentType) return false;
      if (status && status !== 'all' && m.status !== status) return false;
      if (keyword) {
        const kw = keyword.toLowerCase().trim();
        const sub = (m.subject || '').toLowerCase();
        const to = (m.to_email || '').toLowerCase();
        const toName = (m.to_name || '').toLowerCase();
        const from = (m.from_email || '').toLowerCase();
        const camp = (m.campaign_title || '').toLowerCase();
        if (
          !sub.includes(kw) &&
          !to.includes(kw) &&
          !toName.includes(kw) &&
          !from.includes(kw) &&
          !camp.includes(kw)
        ) {
          return false;
        }
      }
      return true;
    });

    // 倒序排列（最新发送的在前）
    list.sort((a, b) => new Date(b.sent_at || b.created_at).getTime() - new Date(a.sent_at || a.created_at).getTime());
    return list;
  });

  ipcMain.handle('sent:get', async (_, id: number) => {
    return (data.sent_mails || []).find((m) => m.id === id) || null;
  });

  ipcMain.handle('sent:delete', async (_, id: number) => {
    data.sent_mails = (data.sent_mails || []).filter((m) => m.id !== id);
    db.save();
    return true;
  });

  ipcMain.handle('sent:clear', async (_, params: { accountId?: number; status?: string } = {}) => {
    const { accountId, status } = params;
    if (accountId || status) {
      data.sent_mails = (data.sent_mails || []).filter((m) => {
        if (accountId && m.account_id === accountId) return false;
        if (status && m.status === status) return false;
        return true;
      });
    } else {
      data.sent_mails = [];
    }
    db.save();
    return true;
  });

  // 4.2 草稿箱 (Drafts)
  ipcMain.handle('drafts:list', async (_, params: {
    draftType?: 'all' | 'single' | 'campaign';
    keyword?: string;
  } = {}) => {
    const { draftType, keyword } = params;
    let list = (data.drafts || []).filter((d) => {
      if (draftType && draftType !== 'all' && d.draft_type !== draftType) return false;
      if (keyword) {
        const kw = keyword.toLowerCase().trim();
        const sub = (d.subject || '').toLowerCase();
        const title = (d.title || '').toLowerCase();
        const to = (d.to_email || '').toLowerCase();
        const toName = (d.to_name || '').toLowerCase();
        if (!sub.includes(kw) && !title.includes(kw) && !to.includes(kw) && !toName.includes(kw)) {
          return false;
        }
      }
      return true;
    });
    list.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
    return list;
  });

  ipcMain.handle('drafts:get', async (_, id: number) => {
    return (data.drafts || []).find((d) => d.id === id) || null;
  });

  ipcMain.handle('drafts:save', async (_, draft: Partial<DraftMail>) => {
    const now = new Date().toISOString();
    if (!data.drafts) data.drafts = [];
    if (draft.id) {
      const idx = data.drafts.findIndex((d) => d.id === draft.id);
      if (idx !== -1) {
        data.drafts[idx] = {
          ...data.drafts[idx],
          ...draft,
          updated_at: now,
        };
        db.save();
        return data.drafts[idx];
      }
    }
    const newDraft: DraftMail = {
      id: db.getNextId('drafts'),
      account_id: draft.account_id,
      account_name: draft.account_name,
      from_email: draft.from_email,
      to_email: draft.to_email || '',
      to_name: draft.to_name || '',
      subject: draft.subject || '',
      body_html: draft.body_html || '',
      draft_type: draft.draft_type || 'single',
      title: draft.title || '',
      account_ids: draft.account_ids || [],
      group_ids: draft.group_ids || [],
      recipients_text: draft.recipients_text || '',
      min_interval: draft.min_interval || 3,
      max_interval: draft.max_interval || 8,
      created_at: now,
      updated_at: now,
    };
    data.drafts.unshift(newDraft);
    db.save();
    return newDraft;
  });

  ipcMain.handle('drafts:delete', async (_, id: number) => {
    data.drafts = (data.drafts || []).filter((d) => d.id !== id);
    db.save();
    return true;
  });

  ipcMain.handle('drafts:clear', async (_, params: { draftType?: string } = {}) => {
    if (params.draftType && params.draftType !== 'all') {
      data.drafts = (data.drafts || []).filter((d) => d.draft_type !== params.draftType);
    } else {
      data.drafts = [];
    }
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

  // 8. 配置导入与导出
  // 导出发件箱配置为 JSON 文件
  ipcMain.handle('config:export-accounts', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const dateStr = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(win || undefined, {
      title: '导出发件箱配置',
      defaultPath: `mail_hub_accounts_${dateStr}.json`,
      filters: [{ name: 'JSON 配置文件', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, message: '用户取消导出' };
    }

    // 格式化输出账号数据
    fs.writeFileSync(result.filePath, JSON.stringify(data.accounts, null, 2), 'utf-8');
    return { success: true, count: data.accounts.length, path: result.filePath };
  });

  // 从 JSON 文件导入发件箱配置
  ipcMain.handle('config:import-accounts', async (event, mode: 'merge' | 'replace' = 'merge') => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win || undefined, {
      title: '导入发件箱配置文件',
      properties: ['openFile'],
      filters: [{ name: 'JSON 配置文件', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, message: '用户取消导入' };
    }

    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8');
      const importedList = JSON.parse(content);
      if (!Array.isArray(importedList)) {
        throw new Error('导入文件格式不合法，必须是发件箱数组');
      }

      let importedCount = 0;
      if (mode === 'replace') {
        data.accounts = [];
      }

      for (const item of importedList) {
        if (!item.host || !item.username || !item.from_email) {
          continue; // 跳过无效数据
        }

        const existingIndex = data.accounts.findIndex(
          (a) => a.from_email.toLowerCase() === item.from_email.toLowerCase()
        );

        const normalizedAccount: Account = {
          id: existingIndex !== -1 ? data.accounts[existingIndex].id : db.getNextId('accounts'),
          name: item.name || item.from_email,
          host: item.host,
          port: item.port || 465,
          username: item.username,
          password: item.password || '',
          from_email: item.from_email,
          from_name: item.from_name || '',
          use_ssl: item.use_ssl !== false,
          daily_limit: item.daily_limit || 0,
          sent_today: 0,
          last_reset_date: new Date().toISOString().slice(0, 10),
          status: item.status || 'active',
          last_error: '',
          enable_inbound: item.enable_inbound !== false,
          imap_host: item.imap_host || '',
          imap_port: item.imap_port || 993,
          imap_use_ssl: item.imap_use_ssl !== false,
          imap_username: item.imap_username || '',
          imap_password: item.imap_password || '',
          created_at: new Date().toISOString(),
        };

        if (existingIndex !== -1) {
          data.accounts[existingIndex] = normalizedAccount;
        } else {
          data.accounts.push(normalizedAccount);
        }
        importedCount++;
      }

      db.save();
      return { success: true, count: importedCount };
    } catch (err: any) {
      throw new Error('导入失败: ' + err.message);
    }
  });

  // 完整备份导出 (包含发件箱、联系人、模板)
  ipcMain.handle('config:export-backup', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const dateStr = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(win || undefined, {
      title: '导出完整数据备份',
      defaultPath: `mail_hub_backup_${dateStr}.json`,
      filters: [{ name: 'JSON 备份文件', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false };
    }

    const backupData = {
      accounts: data.accounts,
      groups: data.groups,
      contacts: data.contacts,
      templates: data.templates,
      sent_mails: data.sent_mails || [],
      drafts: data.drafts || [],
      backup_time: new Date().toISOString(),
    };

    fs.writeFileSync(result.filePath, JSON.stringify(backupData, null, 2), 'utf-8');
    return { success: true, path: result.filePath };
  });

  // 完整备份导入恢复
  ipcMain.handle('config:import-backup', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win || undefined, {
      title: '选择恢复备份文件',
      properties: ['openFile'],
      filters: [{ name: 'JSON 备份文件', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false };
    }

    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf-8');
      const backup = JSON.parse(content);

      if (Array.isArray(backup.accounts)) data.accounts = backup.accounts;
      if (Array.isArray(backup.groups)) data.groups = backup.groups;
      if (Array.isArray(backup.contacts)) data.contacts = backup.contacts;
      if (Array.isArray(backup.templates)) data.templates = backup.templates;
      if (Array.isArray(backup.sent_mails)) data.sent_mails = backup.sent_mails;
      if (Array.isArray(backup.drafts)) data.drafts = backup.drafts;

      db.save();
      return { success: true };
    } catch (err: any) {
      throw new Error('恢复备份失败: ' + err.message);
    }
  });
}
