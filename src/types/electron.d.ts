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

export interface SentMail {
  id: number;
  account_id: number;
  account_name: string;
  from_email: string;
  to_email: string;
  to_name: string;
  subject: string;
  body_html: string;
  sent_type: 'single' | 'campaign';
  campaign_id?: number;
  campaign_title?: string;
  status: 'success' | 'failed';
  error_msg?: string;
  sent_at: string;
  created_at: string;
}

export interface ContactGroup {
  id: number;
  name: string;
  description: string;
  contacts_count?: number;
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
  sent_at?: string;
  created_at: string;
}

export interface SystemStats {
  accounts_count: number;
  contacts_count: number;
  campaigns_count: number;
  total_success: number;
  total_fail: number;
}

export interface ElectronAPI {
  getAccounts: () => Promise<Account[]>;
  saveAccount: (acc: Partial<Account>) => Promise<boolean>;
  deleteAccount: (id: number) => Promise<boolean>;
  testSmtp: (account: Partial<Account>, testTo: string) => Promise<any>;
  testImap: (account: Partial<Account>) => Promise<boolean>;

  sendSingle: (payload: {
    accountId: number;
    toEmail: string;
    toName?: string;
    subject: string;
    bodyHtml: string;
  }) => Promise<boolean>;

  createCampaign: (payload: {
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
  }) => Promise<Campaign>;
  getCampaigns: () => Promise<Campaign[]>;
  startCampaign: (id: number) => Promise<boolean>;
  pauseCampaign: (id: number) => Promise<boolean>;
  updateCampaignConfig: (payload: {
    id: number;
    min_interval: number;
    max_interval: number;
    enable_batch_rest?: boolean;
    batch_size?: number;
    batch_rest_sec?: number;
  }) => Promise<boolean>;
  deleteCampaign: (id: number) => Promise<boolean>;
  getCampaignLogs: (campaignId: number, status?: string) => Promise<TaskLog[]>;

  getInboundMails: (params: {
    accountId?: number;
    isRead?: string;
    keyword?: string;
  }) => Promise<InboundMail[]>;
  getInboundMail: (id: number) => Promise<InboundMail | null>;
  syncInboundMails: (accountId?: number) => Promise<{ totalNew: number; errors: string[] }>;
  markInboundRead: (id: number, isRead: boolean) => Promise<boolean>;
  deleteInboundMail: (id: number) => Promise<boolean>;

  getSentMails: (params?: {
    accountId?: number;
    sentType?: 'all' | 'single' | 'campaign';
    status?: 'all' | 'success' | 'failed';
    keyword?: string;
  }) => Promise<SentMail[]>;
  getSentMail: (id: number) => Promise<SentMail | null>;
  deleteSentMail: (id: number) => Promise<boolean>;
  clearSentMails: (params?: { accountId?: number; status?: string }) => Promise<boolean>;

  getGroups: () => Promise<ContactGroup[]>;
  saveGroup: (group: Partial<ContactGroup>) => Promise<ContactGroup>;
  deleteGroup: (id: number) => Promise<boolean>;
  getContacts: (params: { groupId?: number; keyword?: string }) => Promise<Contact[]>;
  saveContact: (contact: Partial<Contact>) => Promise<Contact>;
  batchImportContacts: (groupId: number, content: string) => Promise<number>;
  deleteContact: (id: number) => Promise<boolean>;
  clearContacts: (groupId?: number) => Promise<boolean>;

  getTemplates: () => Promise<Template[]>;
  saveTemplate: (template: Partial<Template>) => Promise<boolean>;
  deleteTemplate: (id: number) => Promise<boolean>;

  getStats: () => Promise<SystemStats>;

  exportAccounts: () => Promise<{ success: boolean; count?: number; path?: string }>;
  importAccounts: (mode?: 'merge' | 'replace') => Promise<{ success: boolean; count?: number }>;
  exportBackup: () => Promise<{ success: boolean; path?: string }>;
  importBackup: () => Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
