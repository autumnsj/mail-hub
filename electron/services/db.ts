import { app } from 'electron';
import fs from 'fs';
import path from 'path';

export interface Account {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  from_email: string;
  from_name: string;
  use_ssl: boolean;
  daily_limit: number;
  sent_today: number;
  last_reset_date: string;
  status: 'active' | 'disabled' | 'error';
  last_error: string;
  enable_inbound: boolean;
  imap_host: string;
  imap_port: number;
  imap_use_ssl: boolean;
  imap_username?: string;
  imap_password?: string;
  last_sync_at?: string;
  created_at: string;
}

export interface InboundMail {
  id: number;
  account_id: number;
  account_name: string;
  account_email: string;
  uid: string;
  message_id: string;
  from_address: string;
  from_name: string;
  to_address: string;
  subject: string;
  body_html: string;
  body_text: string;
  date: string;
  is_read: boolean;
  created_at: string;
}

// 已发邮件 (发件箱) 记录
export interface SentMail {
  id: number;
  account_id: number;
  account_name: string;
  from_email: string;
  to_email: string;
  to_name: string;
  subject: string;
  body_html: string;
  sent_type: 'single' | 'campaign'; // 单发还是群发
  campaign_id?: number;
  campaign_title?: string;
  status: 'success' | 'failed';
  error_msg?: string;
  sent_at: string;
  created_at: string;
}

// 草稿邮件 (草稿箱) 记录
export interface DraftMail {
  id: number;
  account_id?: number;
  account_name?: string;
  from_email?: string;
  to_email?: string;
  to_name?: string;
  subject?: string;
  body_html?: string;
  draft_type: 'single' | 'campaign'; // 单发草稿还是群发草稿
  // 群发草稿专有参数
  title?: string;
  account_ids?: number[];
  group_ids?: number[];
  recipients_text?: string;
  min_interval?: number;
  max_interval?: number;
  send_mode?: 'interval' | 'time_budget';
  target_duration_minutes?: number;
  created_at: string;
  updated_at: string;
}

export interface ContactGroup {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface Contact {
  id: number;
  group_id: number;
  email: string;
  name: string;
  company: string;
  created_at: string;
}

export interface Template {
  id: number;
  title: string;
  subject: string;
  body_html: string;
  created_at: string;
}

export interface Campaign {
  id: number;
  title: string;
  subject: string;
  body_html: string;
  account_ids: number[];
  status: 'draft' | 'running' | 'paused' | 'completed' | 'failed';
  total_count: number;
  success_count: number;
  fail_count: number;

  send_mode?: 'interval' | 'time_budget'; // 控速模式：固定间隔区间 | 限定总时长匀速
  target_duration_minutes?: number;        // 目标限时（分钟）
  target_finish_time?: string;             // 目标结束时间戳
  started_at?: string;                     // 任务启动时间戳

  min_interval: number;
  max_interval: number;
  enable_batch_rest?: boolean;
  batch_size?: number;
  batch_rest_sec?: number;
  max_retries?: number;

  current_sending_to?: string;
  current_sending_from?: string;
  current_delay_info?: string;

  created_at: string;
  finished_at?: string;
}

export interface TaskLog {
  id: number;
  campaign_id: number;
  account_id: number;
  from_email: string;
  to_email: string;
  to_name: string;
  subject: string;
  status: 'pending' | 'sending' | 'success' | 'failed';
  error_msg: string;
  retry_count?: number;
  sent_at?: string;
  created_at: string;
}

interface DatabaseSchema {
  accounts: Account[];
  inbound_mails: InboundMail[];
  sent_mails: SentMail[]; // 已发送邮件
  drafts: DraftMail[]; // 草稿箱
  groups: ContactGroup[];
  contacts: Contact[];
  templates: Template[];
  campaigns: Campaign[];
  task_logs: TaskLog[];
  next_id: Record<string, number>;
}

class LocalDatabase {
  private filePath: string;
  private data: DatabaseSchema;

  constructor() {
    let userDataDir = '.';
    try {
      if (app) {
        userDataDir = app.getPath('userData');
      }
    } catch {
      userDataDir = '.';
    }

    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    this.filePath = path.join(userDataDir, 'mail_hub_data.json');
    this.data = this.load();
  }

  private load(): DatabaseSchema {
    if (fs.existsSync(this.filePath)) {
      try {
        const content = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (!parsed.sent_mails) parsed.sent_mails = [];
        if (!parsed.drafts) parsed.drafts = [];
        return parsed;
      } catch (e) {
        console.error('加载本地数据库异常，重置新结构:', e);
      }
    }
    const defaultData: DatabaseSchema = {
      accounts: [],
      inbound_mails: [],
      sent_mails: [],
      drafts: [],
      groups: [],
      contacts: [],
      templates: [],
      campaigns: [],
      task_logs: [],
      next_id: {
        accounts: 1,
        inbound_mails: 1,
        sent_mails: 1,
        drafts: 1,
        groups: 1,
        contacts: 1,
        templates: 1,
        campaigns: 1,
        task_logs: 1,
      },
    };
    this.save(defaultData);
    return defaultData;
  }

  public save(newData?: DatabaseSchema) {
    if (newData) this.data = newData;
    const tempPath = `${this.filePath}.tmp`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    }
  }

  public getNextId(table: keyof DatabaseSchema['next_id']): number {
    if (!this.data.next_id) {
      this.data.next_id = {};
    }
    const id = this.data.next_id[table] || 1;
    this.data.next_id[table] = id + 1;
    return id;
  }

  public getData(): DatabaseSchema {
    if (!this.data.sent_mails) {
      this.data.sent_mails = [];
    }
    if (!this.data.drafts) {
      this.data.drafts = [];
    }
    return this.data;
  }
}

export const db = new LocalDatabase();
