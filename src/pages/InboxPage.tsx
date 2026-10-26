import React, { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Select,
  Space,
  Input,
  Tag,
  Drawer,
  message,
  Popconfirm,
  Badge,
  Modal,
  Form,
} from 'antd';
import {
  SyncOutlined,
  DeleteOutlined,
  RollbackOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { InboundMail, Account } from '../types/electron';
import { RichEditor } from '../components/RichEditor';

export const InboxPage: React.FC = () => {
  const [mails, setMails] = useState<InboundMail[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number>(0);
  const [isReadFilter, setIsReadFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // 查看邮件详情 Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeMail, setActiveMail] = useState<InboundMail | null>(null);

  // 回复邮件 Modal
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [replyForm] = Form.useForm();

  const fetchAccounts = async () => {
    try {
      const data = await window.electronAPI.getAccounts();
      setAccounts(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMails = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getInboundMails({
        accountId: selectedAccountId > 0 ? selectedAccountId : undefined,
        isRead: isReadFilter,
        keyword,
      });
      setMails(data || []);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchMails();
  }, [selectedAccountId, isReadFilter, keyword]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await window.electronAPI.syncInboundMails(
        selectedAccountId > 0 ? selectedAccountId : undefined
      );
      message.success(`收取完成！成功拉取到 ${res.totalNew || 0} 封新邮件`);
      fetchMails();
    } catch (e: any) {
      message.error(e.message || '收信失败');
    } finally {
      setSyncing(false);
    }
  };

  const handleViewDetail = async (record: InboundMail) => {
    try {
      const full = await window.electronAPI.getInboundMail(record.id);
      setActiveMail(full || record);
    } catch {
      setActiveMail(record);
    }
    setDrawerOpen(true);
    if (!record.is_read) {
      await window.electronAPI.markInboundRead(record.id, true);
      setMails((prev) =>
        prev.map((m) => (m.id === record.id ? { ...m, is_read: true } : m))
      );
    }
  };

  const handleToggleRead = async (record: InboundMail, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const next = !record.is_read;
      await window.electronAPI.markInboundRead(record.id, next);
      setMails((prev) =>
        prev.map((m) => (m.id === record.id ? { ...m, is_read: next } : m))
      );
      message.success(next ? '已标为已读' : '已标为未读');
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleDeleteMail = async (id: number) => {
    try {
      await window.electronAPI.deleteInboundMail(id);
      message.success('已删除');
      if (activeMail?.id === id) setDrawerOpen(false);
      fetchMails();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const openReplyModal = () => {
    if (!activeMail) return;
    const defaultSubject = activeMail.subject.startsWith('Re:')
      ? activeMail.subject
      : `Re: ${activeMail.subject}`;

    const quoteBody = `
      <p></p>
      <br/>
      <div style="border-left: 2px solid #ccc; padding-left: 10px; margin-left: 5px; color: #666; font-size: 13px;">
        <p><strong>----- 原始邮件 -----</strong></p>
        <p><strong>发件人：</strong> ${activeMail.from_name || ''} &lt;${activeMail.from_address}&gt;</p>
        <p><strong>发送时间：</strong> ${activeMail.date?.slice(0, 19).replace('T', ' ')}</p>
        <p><strong>主题：</strong> ${activeMail.subject}</p>
        <br/>
        ${activeMail.body_html || `<p>${activeMail.body_text || ''}</p>`}
      </div>
    `;

    replyForm.setFieldsValue({
      account_id: activeMail.account_id,
      to_email: activeMail.from_address,
      subject: defaultSubject,
    });
    setReplyContent(quoteBody);
    setReplyOpen(true);
  };

  const handleSendReply = async () => {
    try {
      const values = await replyForm.validateFields();
      setReplyLoading(true);
      await window.electronAPI.sendSingle({
        accountId: values.account_id,
        toEmail: values.to_email,
        subject: values.subject,
        bodyHtml: replyContent,
      });
      message.success('回复邮件已成功发出！');
      setReplyOpen(false);
    } catch (e: any) {
      message.error(e.message || '回复失败');
    } finally {
      setReplyLoading(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space wrap>
          <Select
            style={{ width: 220 }}
            value={selectedAccountId}
            onChange={(val) => setSelectedAccountId(val)}
          >
            <Select.Option value={0}>全部发件箱收件</Select.Option>
            {accounts.map((a) => (
              <Select.Option key={a.id} value={a.id}>
                {a.name} ({a.from_email})
              </Select.Option>
            ))}
          </Select>

          <Select
            style={{ width: 120 }}
            value={isReadFilter}
            onChange={(val) => setIsReadFilter(val)}
          >
            <Select.Option value="all">全部邮件</Select.Option>
            <Select.Option value="unread">仅看未读</Select.Option>
            <Select.Option value="read">仅看已读</Select.Option>
          </Select>

          <Input.Search
            placeholder="搜索发件人或主题..."
            style={{ width: 220 }}
            onSearch={(val) => setKeyword(val)}
            allowClear
          />
        </Space>

        <Button
          type="primary"
          icon={<SyncOutlined spin={syncing} />}
          loading={syncing}
          onClick={handleSync}
        >
          立即收取最新邮件 (IMAP)
        </Button>
      </div>

      <Table
        rowKey="id"
        dataSource={mails}
        loading={loading}
        pagination={{ pageSize: 15 }}
        onRow={(record) => ({
          onClick: () => handleViewDetail(record),
          style: { cursor: 'pointer' },
        })}
        columns={[
          {
            title: '',
            dataIndex: 'is_read',
            width: 40,
            render: (isRead) => (!isRead ? <Badge status="processing" /> : null),
          },
          {
            title: '发件人',
            dataIndex: 'from_address',
            width: 240,
            render: (fromAddr, record) => (
              <div>
                <strong style={{ color: record.is_read ? '#666' : '#111' }}>
                  {record.from_name || fromAddr}
                </strong>
                {record.from_name && (
                  <div style={{ fontSize: 12, color: '#888' }}>{fromAddr}</div>
                )}
              </div>
            ),
          },
          {
            title: '邮件主题',
            dataIndex: 'subject',
            render: (subject, record) => (
              <div>
                <span
                  style={{
                    fontWeight: record.is_read ? 400 : 600,
                    color: record.is_read ? '#444' : '#000',
                  }}
                >
                  {subject || '(无主题)'}
                </span>
                <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
                  - 收于: {record.account_name}
                </span>
              </div>
            ),
          },
          {
            title: '接收时间',
            dataIndex: 'date',
            width: 170,
            render: (d) => (d ? d.slice(0, 16).replace('T', ' ') : '-'),
          },
          {
            title: '操作',
            width: 120,
            render: (_, record) => (
              <Space onClick={(e) => e.stopPropagation()}>
                <Button
                  size="small"
                  type="text"
                  icon={<CheckOutlined />}
                  title={record.is_read ? '标为未读' : '标为已读'}
                  onClick={(e) => handleToggleRead(record, e)}
                />
                <Popconfirm
                  title="确认删除该本地邮件？"
                  onConfirm={() => handleDeleteMail(record.id)}
                  okText="删除"
                  cancelText="取消"
                >
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {/* 邮件正文阅读 Drawer */}
      <Drawer
        title={activeMail?.subject || '邮件详情'}
        width={750}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Button type="primary" icon={<RollbackOutlined />} onClick={openReplyModal}>
              一键回复邮件
            </Button>
            <Popconfirm
              title="确定删除该邮件？"
              onConfirm={() => activeMail && handleDeleteMail(activeMail.id)}
            >
              <Button danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        }
      >
        {activeMail && (
          <div>
            <div
              style={{
                padding: '12px 16px',
                background: '#fafafa',
                borderRadius: 8,
                border: '1px solid #f0f0f0',
                marginBottom: 20,
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <strong>发件人：</strong>
                <span>{activeMail.from_name ? `${activeMail.from_name} <${activeMail.from_address}>` : activeMail.from_address}</span>
              </div>
              <div style={{ marginBottom: 6 }}>
                <strong>收件人：</strong>
                <span>{activeMail.to_address}</span>
                <Tag color="blue" style={{ marginLeft: 8 }}>
                  归属邮箱: {activeMail.account_name}
                </Tag>
              </div>
              <div>
                <strong>发送时间：</strong>
                <span style={{ color: '#666' }}>{activeMail.date?.slice(0, 19).replace('T', ' ')}</span>
              </div>
            </div>

            <div
              className="selectable"
              style={{
                lineHeight: 1.7,
                fontSize: 14,
                color: '#222',
                minHeight: 280,
                background: '#fff',
                padding: '12px 0',
              }}
            >
              {activeMail.body_html ? (
                <iframe
                  title="mail-body"
                  srcDoc={activeMail.body_html}
                  sandbox="allow-same-origin allow-popups"
                  style={{
                    width: '100%',
                    minHeight: 450,
                    border: '1px solid #f0f0f0',
                    borderRadius: 6,
                    background: '#fff',
                  }}
                />
              ) : (
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    fontFamily: 'inherit',
                  }}
                >
                  {activeMail.body_text || '(无正文)'}
                </pre>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        title={`回复邮件给: ${activeMail?.from_address}`}
        open={replyOpen}
        onOk={handleSendReply}
        onCancel={() => setReplyOpen(false)}
        confirmLoading={replyLoading}
        width={720}
        okText="立即发出"
        cancelText="取消"
      >
        <Form form={replyForm} layout="vertical">
          <Form.Item
            name="account_id"
            label="选用发件邮箱"
            rules={[{ required: true, message: '请选择发信邮箱' }]}
          >
            <Select placeholder="选择发信邮箱">
              {accounts.map((a) => (
                <Select.Option key={a.id} value={a.id}>
                  {a.name} ({a.from_email})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="to_email" label="收件人">
            <Input disabled />
          </Form.Item>

          <Form.Item name="subject" label="主题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item label="回复正文" required>
            <RichEditor value={replyContent} onChange={setReplyContent} height={240} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
