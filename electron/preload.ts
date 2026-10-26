import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Accounts
  getAccounts: () => ipcRenderer.invoke('accounts:list'),
  saveAccount: (acc: any) => ipcRenderer.invoke('accounts:save', acc),
  deleteAccount: (id: number) => ipcRenderer.invoke('accounts:delete', id),
  testSmtp: (account: any, testTo: string) => ipcRenderer.invoke('accounts:test-smtp', { account, testTo }),
  testImap: (account: any) => ipcRenderer.invoke('accounts:test-imap', account),

  // Send
  sendSingle: (payload: any) => ipcRenderer.invoke('send:single', payload),

  // Campaigns
  createCampaign: (payload: any) => ipcRenderer.invoke('campaigns:create', payload),
  getCampaigns: () => ipcRenderer.invoke('campaigns:list'),
  startCampaign: (id: number) => ipcRenderer.invoke('campaigns:start', id),
  pauseCampaign: (id: number) => ipcRenderer.invoke('campaigns:pause', id),
  updateCampaignConfig: (payload: any) => ipcRenderer.invoke('campaigns:update-config', payload),
  deleteCampaign: (id: number) => ipcRenderer.invoke('campaigns:delete', id),
  getCampaignLogs: (campaignId: number, status?: string) =>
    ipcRenderer.invoke('campaigns:logs', { campaignId, status }),

  // Inbound
  getInboundMails: (params: any) => ipcRenderer.invoke('inbound:list', params),
  getInboundMail: (id: number) => ipcRenderer.invoke('inbound:get', id),
  syncInboundMails: (accountId?: number) => ipcRenderer.invoke('inbound:sync', accountId),
  markInboundRead: (id: number, isRead: boolean) =>
    ipcRenderer.invoke('inbound:read', { id, isRead }),
  deleteInboundMail: (id: number) => ipcRenderer.invoke('inbound:delete', id),

  // Sent Mails (发件箱)
  getSentMails: (params?: any) => ipcRenderer.invoke('sent:list', params),
  getSentMail: (id: number) => ipcRenderer.invoke('sent:get', id),
  deleteSentMail: (id: number) => ipcRenderer.invoke('sent:delete', id),
  clearSentMails: (params?: any) => ipcRenderer.invoke('sent:clear', params),

  // Contacts & Groups
  getGroups: () => ipcRenderer.invoke('groups:list'),
  saveGroup: (group: any) => ipcRenderer.invoke('groups:save', group),
  deleteGroup: (id: number) => ipcRenderer.invoke('groups:delete', id),
  getContacts: (params: any) => ipcRenderer.invoke('contacts:list', params),
  saveContact: (contact: any) => ipcRenderer.invoke('contacts:save', contact),
  batchImportContacts: (groupId: number, content: string) =>
    ipcRenderer.invoke('contacts:batch', { groupId, content }),
  deleteContact: (id: number) => ipcRenderer.invoke('contacts:delete', id),
  clearContacts: (groupId?: number) => ipcRenderer.invoke('contacts:clear', groupId),

  // Templates
  getTemplates: () => ipcRenderer.invoke('templates:list'),
  saveTemplate: (template: any) => ipcRenderer.invoke('templates:save', template),
  deleteTemplate: (id: number) => ipcRenderer.invoke('templates:delete', id),

  // Stats
  getStats: () => ipcRenderer.invoke('stats:get'),

  // Config Import & Export
  exportAccounts: () => ipcRenderer.invoke('config:export-accounts'),
  importAccounts: (mode?: 'merge' | 'replace') => ipcRenderer.invoke('config:import-accounts', mode),
  exportBackup: () => ipcRenderer.invoke('config:export-backup'),
  importBackup: () => ipcRenderer.invoke('config:import-backup'),
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
