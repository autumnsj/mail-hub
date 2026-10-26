import React, { useEffect, useState } from 'react';
import {
  Form,
  Input,
  Button,
  Select,
  Checkbox,
  InputNumber,
  Space,
  message,
  Card,
  Typography,
  Alert,
  Divider,
  Tag,
} from 'antd';
import { RocketOutlined, ClusterOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { RichEditor } from '../components/RichEditor';
import { Account, ContactGroup, Template } from '../types/electron';

const { Title, Paragraph } = Typography;

export const BatchSendPage: React.FC = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [content, setContent] = useState('<p>尊敬的 {name}：</p><p>这是发给您的专属通知内容...</p>');
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    window.electronAPI.getAccounts().then((res) => {
      const activeList = (res || []).filter((a) => a.status === 'active');
      setAccounts(activeList);
      setSelectedAccounts(activeList.map((a) => a.id));
      form.setFieldsValue({ account_ids: activeList.map((a) => a.id) });
    });
    window.electronAPI.getGroups().then((res) => setGroups(res || []));
    window.electronAPI.getTemplates().then((res) => setTemplates(res || []));
  }, []);

  const handleApplyTemplate = (tplId: number) => {
    const tpl = templates.find((t) => t.id === tplId);
    if (tpl) {
      form.setFieldsValue({ subject: tpl.subject });
      setContent(tpl.body_html);
      message.info(`已载入模板: ${tpl.title}`);
    }
  };

  const handleSubmit = async (autoStart: boolean) => {
    try {
      const values = await form.validateFields();
      if (!selectedAccounts || selectedAccounts.length === 0) {
        message.warning('请至少勾选一个发件邮箱！');
        return;
      }
      if (!content || content.trim() === '<p></p>') {
        message.warning('邮件正文内容不能为空');
        return;
      }

      setLoading(true);
      await window.electronAPI.createCampaign({
        title: values.title,
        subject: values.subject,
        body_html: content,
        account_ids: selectedAccounts,
        group_ids: values.group_ids || [],
        recipients_text: values.recipients || '',
        min_interval: values.min_interval || 2,
        max_interval: values.max_interval || 5,
        auto_start: autoStart,
      });

      message.success(autoStart ? '任务创建成功并已开始分发！' : '批量任务已保存为草稿！');
      navigate('/tasks');
    } catch (e: any) {
      message.error(e.message || '创建任务失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          多邮箱分摊群发 (智能轮询)
        </Title>
        <Paragraph type="secondary">
          勾选多个发件箱，系统将按轮询（Round-Robin）分摊机制均衡打散发送，智能隔离风控。
        </Paragraph>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            min_interval: 2,
            max_interval: 5,
          }}
        >
          <Form.Item
            name="title"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="如：2026年第四季度客户产品服务通知" />
          </Form.Item>

          {/* 重点：多发件箱选择与分摊说明 */}
          <Card
            type="inner"
            title={
              <Space>
                <ClusterOutlined style={{ color: '#1677ff' }} />
                <span>参与分摊的发件邮箱 (勾选多个以分摊发信压力)</span>
              </Space>
            }
            style={{ marginBottom: 18, background: '#fafafa' }}
          >
            {accounts.length === 0 ? (
              <Alert
                type="warning"
                message="暂无可用发件箱，请先前往「发件箱配置」添加发件箱"
              />
            ) : (
              <div>
                <Checkbox.Group
                  value={selectedAccounts}
                  onChange={(vals) => setSelectedAccounts(vals as number[])}
                  style={{ width: '100%' }}
                >
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {accounts.map((acc) => (
                      <div
                        key={acc.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: '#fff',
                          borderRadius: 6,
                          border: '1px solid #e8e8e8',
                        }}
                      >
                        <Checkbox value={acc.id}>
                          <strong>{acc.name}</strong> ({acc.from_email})
                        </Checkbox>
                        <Space>
                          <span style={{ fontSize: 13, color: '#666' }}>
                            今日已发: {acc.sent_today}{acc.daily_limit > 0 ? `/${acc.daily_limit}` : ''}
                          </span>
                          <Tag color="blue">{acc.host}</Tag>
                        </Space>
                      </div>
                    ))}
                  </Space>
                </Checkbox.Group>

                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 12 }}
                  message={`已选中 ${selectedAccounts.length} 个发件邮箱。发信时系统将自动依次轮换发件账号。如果某一账号达单日限额，将无感切换至下一可用账号。`}
                />
              </div>
            )}
          </Card>

          {/* 收件人配置 */}
          <Card type="inner" title="目标收件人设置" style={{ marginBottom: 18 }}>
            <Form.Item name="group_ids" label="从已有联系人群组选取">
              <Select mode="multiple" placeholder="请选择群组 (可多选)" allowClear>
                {groups.map((g) => (
                  <Select.Option key={g.id} value={g.id}>
                    {g.name} ({g.contacts_count || 0} 个联系人)
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="recipients"
              label="或直接大文本粘贴收件人 (支持一行一个邮箱，或 姓名,邮箱 格式)"
              extra="系统自动提取邮箱与姓名并排重清洗"
            >
              <Input.TextArea
                rows={4}
                placeholder={"zhangsan@example.com\n李四,lisi@company.com\n王五 <wangwu@test.org>"}
              />
            </Form.Item>
          </Card>

          {/* 防风控延时设置 */}
          <Card type="inner" title="发送频率防封保护 (发送间隔抖动)" style={{ marginBottom: 18 }}>
            <Space align="center" size="middle">
              <span>每封邮件随机延时：</span>
              <Form.Item name="min_interval" noStyle>
                <InputNumber min={1} max={60} addonAfter="秒" />
              </Form.Item>
              <span>至</span>
              <Form.Item name="max_interval" noStyle>
                <InputNumber min={1} max={120} addonAfter="秒" />
              </Form.Item>
              <span style={{ color: '#888', fontSize: 13 }}>
                (建议保留 2~5 秒间隔，模拟真人发信规律)
              </span>
            </Space>
          </Card>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <Form.Item
              name="subject"
              label="邮件主题"
              rules={[{ required: true, message: '请输入邮件主题' }]}
              style={{ flex: 1 }}
            >
              <Input placeholder="支持动态变量如：【{name}】您有一封专属通知" />
            </Form.Item>

            {templates.length > 0 && (
              <Form.Item label="载入模板" style={{ width: 220 }}>
                <Select
                  placeholder="选择模板填充"
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

          <Form.Item label="邮件正文 (支持富文本与变量)" required>
            <RichEditor value={content} onChange={setContent} height={320} />
          </Form.Item>

          <Divider />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <Button size="large" loading={loading} onClick={() => handleSubmit(false)}>
              保存为草稿
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<RocketOutlined />}
              loading={loading}
              onClick={() => handleSubmit(true)}
            >
              立即创建并开始分摊群发
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};
