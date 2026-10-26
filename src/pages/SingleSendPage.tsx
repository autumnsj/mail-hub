import React, { useEffect, useState } from 'react';
import { Form, Input, Button, Select, Space, message, Card, Typography, Divider } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { RichEditor } from '../components/RichEditor';
import { Account, Template } from '../types/electron';

const { Title, Paragraph } = Typography;

export const SingleSendPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [content, setContent] = useState('<p>您好，这是一封重要邮件通知。</p>');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    window.electronAPI.getAccounts().then((res) => {
      setAccounts((res || []).filter((a) => a.status === 'active'));
    });
    window.electronAPI.getTemplates().then((res) => {
      setTemplates(res || []);
    });
  }, []);

  const handleApplyTemplate = (tplId: number) => {
    const tpl = templates.find((t) => t.id === tplId);
    if (tpl) {
      form.setFieldsValue({ subject: tpl.subject });
      setContent(tpl.body_html);
      message.info(`已应用模板: ${tpl.title}`);
    }
  };

  const handleSend = async () => {
    try {
      const values = await form.validateFields();
      if (!content || content.trim() === '<p></p>') {
        message.warning('邮件正文内容不能为空');
        return;
      }

      setLoading(true);
      await window.electronAPI.sendSingle({
        accountId: values.account_id,
        toEmail: values.to_email,
        toName: values.to_name,
        subject: values.subject,
        bodyHtml: content,
      });

      message.success('邮件已成功发送！');
      form.resetFields(['to_email', 'to_name']);
    } catch (e: any) {
      message.error(e.message || '发送失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          单封邮件即时发送
        </Title>
        <Paragraph type="secondary">
          从已配置的发件箱中挑选一个，填写收件人与个性化富文本内容，即时完成投递。
        </Paragraph>
      </div>

      <Card>
        <Form form={form} layout="vertical">
          <Form.Item
            name="account_id"
            label="选择发件邮箱"
            rules={[{ required: true, message: '请选择发件箱' }]}
            extra="如无可用发件箱，请先在「发件箱配置」中添加"
          >
            <Select placeholder="请选择发件箱">
              {accounts.map((a) => (
                <Select.Option key={a.id} value={a.id}>
                  {a.name} ({a.from_email}) - 今日已发: {a.sent_today}
                  {a.daily_limit > 0 ? `/${a.daily_limit}` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Space style={{ display: 'flex' }} align="baseline">
            <Form.Item
              name="to_email"
              label="收件人邮箱"
              rules={[{ required: true, message: '请输入收件邮箱' }, { type: 'email' }]}
              style={{ width: 400 }}
            >
              <Input placeholder="recipient@example.com" />
            </Form.Item>

            <Form.Item name="to_name" label="收件人称呼 (选填)" style={{ width: 400 }}>
              <Input placeholder="如：李经理、王先生" />
            </Form.Item>
          </Space>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Form.Item
              name="subject"
              label="邮件主题"
              rules={[{ required: true, message: '请输入邮件主题' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="输入邮件主题，支持 {name}、{date} 等变量占位" />
            </Form.Item>

            {templates.length > 0 && (
              <Form.Item label="快捷载入模板" style={{ width: 220 }}>
                <Select
                  placeholder="选择模板"
                  allowClear
                  onChange={(val) => val && handleApplyTemplate(val)}
                >
                  {templates.map((t) => (
                    <Select.Option key={t.id} value={t.id}>
                      {t.title}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            )}
          </div>

          <Form.Item label="邮件正文 (所见即所得编辑器)" required>
            <RichEditor value={content} onChange={setContent} height={320} />
          </Form.Item>

          <Divider />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="primary"
              size="large"
              icon={<SendOutlined />}
              loading={loading}
              onClick={handleSend}
            >
              立即发送邮件
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};
