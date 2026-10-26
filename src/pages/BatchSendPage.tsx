import React, { useEffect, useState, useMemo } from 'react';
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
  Switch,
  Tooltip,
  Radio,
  Row,
  Col,
} from 'antd';
import {
  RocketOutlined,
  ClusterOutlined,
  InfoCircleOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { RichEditor } from '../components/RichEditor';
import { Account, ContactGroup, Template } from '../types/electron';

const { Title, Paragraph } = Typography;

export const BatchSendPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [content, setContent] = useState('<p>尊敬的 {name}：</p><p>这是发给您的专属通知内容...</p>');
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [sendMode, setSendMode] = useState<'time_budget' | 'interval'>('time_budget');
  const [targetDurationMinutes, setTargetDurationMinutes] = useState<number>(60);
  const [enableBatchRest, setEnableBatchRest] = useState(true);
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

  useEffect(() => {
    if (location.state) {
      const state = location.state as {
        draftId?: number;
        title?: string;
        subject?: string;
        bodyHtml?: string;
        account_ids?: number[];
        group_ids?: number[];
        recipients_text?: string;
        min_interval?: number;
        max_interval?: number;
        send_mode?: 'interval' | 'time_budget';
        target_duration_minutes?: number;
      };
      if (state.draftId) setDraftId(state.draftId);
      if (state.title) form.setFieldValue('title', state.title);
      if (state.subject) form.setFieldValue('subject', state.subject);
      if (state.bodyHtml) setContent(state.bodyHtml);
      if (state.account_ids && state.account_ids.length > 0) {
        setSelectedAccounts(state.account_ids);
        form.setFieldValue('account_ids', state.account_ids);
      }
      if (state.group_ids) form.setFieldValue('group_ids', state.group_ids);
      if (state.recipients_text) form.setFieldValue('recipients', state.recipients_text);
      if (state.min_interval) form.setFieldValue('min_interval', state.min_interval);
      if (state.max_interval) form.setFieldValue('max_interval', state.max_interval);
      if (state.send_mode) setSendMode(state.send_mode);
      if (state.target_duration_minutes) setTargetDurationMinutes(state.target_duration_minutes);
      message.info('已从草稿箱载入群发配置');
    }
  }, [location.state]);

  // 动态测算待发收件人总数
  const watchedRecipients = Form.useWatch('recipients', form);
  const watchedGroupIds = Form.useWatch('group_ids', form);

  const estimatedRecipients = useMemo(() => {
    let count = 0;
    if (watchedGroupIds && Array.isArray(watchedGroupIds)) {
      groups.forEach((g) => {
        if (watchedGroupIds.includes(g.id)) {
          count += g.contacts_count || 0;
        }
      });
    }
    if (watchedRecipients) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matches = (watchedRecipients as string).match(emailRegex);
      if (matches) {
        count += new Set(matches.map((m) => m.toLowerCase())).size;
      }
    }
    return count;
  }, [watchedRecipients, watchedGroupIds, groups]);

  const calculatedBaseSec = useMemo(() => {
    if (estimatedRecipients <= 0) return 0;
    const totalSec = targetDurationMinutes * 60;
    return Math.max(1, +(totalSec / estimatedRecipients).toFixed(1));
  }, [estimatedRecipients, targetDurationMinutes]);

  const handleApplyTemplate = (tplId: number) => {
    const tpl = templates.find((t) => t.id === tplId);
    if (tpl) {
      form.setFieldsValue({ subject: tpl.subject });
      setContent(tpl.body_html);
      message.info(`已载入模板: ${tpl.title}`);
    }
  };

  const handleSaveDraft = async () => {
    try {
      setSavingDraft(true);
      const values = form.getFieldsValue();
      const res = await window.electronAPI.saveDraft({
        id: draftId || undefined,
        title: values.title || '（未命名群发任务）',
        subject: values.subject || '（未命名主题）',
        body_html: content,
        account_ids: selectedAccounts,
        group_ids: values.group_ids || [],
        recipients_text: values.recipients || '',
        send_mode: sendMode,
        target_duration_minutes: sendMode === 'time_budget' ? targetDurationMinutes : undefined,
        min_interval: values.min_interval || 3,
        max_interval: values.max_interval || 8,
        draft_type: 'campaign',
      });
      if (res && res.id) setDraftId(res.id);
      message.success('群发配置已保存至草稿箱！');
    } catch (e: any) {
      message.error(e.message || '保存草稿失败');
    } finally {
      setSavingDraft(false);
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

      const minI =
        sendMode === 'time_budget'
          ? Math.max(1, Math.round(calculatedBaseSec * 0.8))
          : (values.min_interval || 3);
      const maxI =
        sendMode === 'time_budget'
          ? Math.max(minI + 1, Math.round(calculatedBaseSec * 1.2))
          : (values.max_interval || 8);

      setLoading(true);
      await window.electronAPI.createCampaign({
        title: values.title,
        subject: values.subject,
        body_html: content,
        account_ids: selectedAccounts,
        group_ids: values.group_ids || [],
        recipients_text: values.recipients || '',
        send_mode: sendMode,
        target_duration_minutes: sendMode === 'time_budget' ? targetDurationMinutes : undefined,
        min_interval: minI,
        max_interval: maxI,
        enable_batch_rest: enableBatchRest,
        batch_size: values.batch_size || 10,
        batch_rest_sec: values.batch_rest_sec || 30,
        max_retries: values.max_retries || 1,
        auto_start: autoStart,
      });

      if (draftId) {
        try {
          await window.electronAPI.deleteDraft(draftId);
          setDraftId(null);
        } catch {
          // ignore
        }
      }

      message.success(autoStart ? '任务创建成功并已开始逐封发送！' : '批量任务已保存！');
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
          多邮箱分摊群发 (逐封独立投递)
        </Title>
        <Paragraph type="secondary">
          系统严格采用 1 对 1 独立信件发出，每次只填写单一收件人，收件人彼此完全不可见。
        </Paragraph>
      </div>

      <Alert
        type="success"
        showIcon
        icon={<SafetyCertificateOutlined />}
        style={{ marginBottom: 16 }}
        message="逐封发送与防风控机制保障"
        description="勾选多个发件箱后，系统将自动采用轮询算法轮流调用发件箱，在每一封发送之间加入您配置的随机浮动抖动，避免短时间内被 QQ/163/Gmail 拦截。"
      />

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            min_interval: 3,
            max_interval: 8,
            batch_size: 10,
            batch_rest_sec: 30,
            max_retries: 1,
          }}
        >
          <Form.Item
            name="title"
            label="群发任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="如：2026年第四季度客户产品服务通知" />
          </Form.Item>

          {/* 参与分摊的发件箱 */}
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
                <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                  已选中 {selectedAccounts.length} 个发件邮箱。发信时将自动依次轮流使用每个账号投递单封邮件。
                </div>
              </div>
            )}
          </Card>

          {/* 核心需求：防封抖动与限时发完控速策略 */}
          <Card
            type="inner"
            title={
              <Space>
                <ClockCircleOutlined style={{ color: '#1677ff' }} />
                <span>发信控速与限时调度策略</span>
                <Tooltip title="可直接指定期望在多长时间内发完这一批邮件，系统将自动匀速测算单封间隔与随机浮动；或使用传统固定间隔模式">
                  <InfoCircleOutlined style={{ color: '#888' }} />
                </Tooltip>
              </Space>
            }
            style={{ marginBottom: 18 }}
          >
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: '#333' }}>
                选择发信控速模式：
              </div>
              <Radio.Group
                value={sendMode}
                onChange={(e) => setSendMode(e.target.value)}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="time_budget">
                  🎯 限定总耗时平摊发送 (在指定时间内发完)
                </Radio.Button>
                <Radio.Button value="interval">
                  ⏱️ 固定间隔区间随机抖动
                </Radio.Button>
              </Radio.Group>
            </div>

            {sendMode === 'time_budget' ? (
              <div
                style={{
                  background: '#f6ffed',
                  border: '1px solid #b7eb8f',
                  borderRadius: 8,
                  padding: '14px 16px',
                  marginBottom: 14,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#237804', fontSize: 13 }}>
                  期望在多长时间内发完这一批邮件：
                </div>
                <Space wrap style={{ marginBottom: 10 }}>
                  {[15, 30, 45, 60, 90, 120, 180, 240, 360].map((mins) => {
                    const label = mins < 60 ? `${mins}分钟` : `${mins / 60}小时`;
                    return (
                      <Button
                        key={mins}
                        size="small"
                        type={targetDurationMinutes === mins ? 'primary' : 'default'}
                        onClick={() => setTargetDurationMinutes(mins)}
                      >
                        {label}
                      </Button>
                    );
                  })}
                </Space>
                <Space align="center" style={{ display: 'flex', marginTop: 4 }}>
                  <span>自定义限时：</span>
                  <InputNumber
                    min={5}
                    max={1440}
                    value={targetDurationMinutes}
                    onChange={(v) => v && setTargetDurationMinutes(v)}
                    addonAfter="分钟"
                    style={{ width: 140 }}
                  />
                  <span style={{ color: '#8c8c8c', fontSize: 12 }}>
                    (即 {(targetDurationMinutes / 60).toFixed(1)} 小时)
                  </span>
                </Space>

                {/* 智能测算面板 */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #d9d9d9' }}>
                  <Row gutter={12}>
                    <Col span={6}>
                      <div style={{ fontSize: 12, color: '#666' }}>待发收件人</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#1677ff' }}>
                        {estimatedRecipients > 0 ? `${estimatedRecipients} 封` : '根据收件人测算'}
                      </div>
                    </Col>
                    <Col span={6}>
                      <div style={{ fontSize: 12, color: '#666' }}>设定总耗时</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#52c41a' }}>
                        {targetDurationMinutes < 60
                          ? `${targetDurationMinutes} 分钟`
                          : `${(targetDurationMinutes / 60).toFixed(1)} 小时`}
                      </div>
                    </Col>
                    <Col span={6}>
                      <div style={{ fontSize: 12, color: '#666' }}>智能单封测算间隔</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#722ed1' }}>
                        {estimatedRecipients > 0
                          ? `约 ${calculatedBaseSec} 秒 (±20%动态浮动)`
                          : '填写收件人后计算'}
                      </div>
                    </Col>
                    <Col span={6}>
                      <div style={{ fontSize: 12, color: '#666' }}>预计全部送达时刻</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>
                        今日{' '}
                        {new Date(Date.now() + targetDurationMinutes * 60 * 1000)
                          .toTimeString()
                          .slice(0, 5)}
                      </div>
                    </Col>
                  </Row>
                  {calculatedBaseSec < 2 && estimatedRecipients > 0 && (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginTop: 10 }}
                      message="单封发信节奏较快提示"
                      description="当前限时计算出单封间隔低于 2 秒，建议适当勾选更多发件箱分摊，或调大限时，以防触发服务商发信频控。"
                    />
                  )}
                  {calculatedBaseSec >= 2 && estimatedRecipients > 0 && (
                    <div style={{ fontSize: 12, color: '#52c41a', marginTop: 8 }}>
                      ✓ 节奏匀速合理，系统将在设定限时内按随机抖动安全平摊发送完毕。
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 500, marginBottom: 8 }}>单封发送间隔随机抖动范围：</div>
                <Space align="center" size="middle" wrap>
                  <span>最短间隔：</span>
                  <Form.Item name="min_interval" noStyle rules={[{ required: true }]}>
                    <InputNumber min={1} max={60} addonAfter="秒" />
                  </Form.Item>
                  <span>至 最长间隔：</span>
                  <Form.Item name="max_interval" noStyle rules={[{ required: true }]}>
                    <InputNumber min={1} max={180} addonAfter="秒" />
                  </Form.Item>
                  <span style={{ color: '#888', fontSize: 13 }}>
                    (系统将在该区间内生成随机小数延时，如 4.3秒、6.1秒，模拟人工手点)
                  </span>
                </Space>
              </div>
            )}

            <Divider style={{ margin: '14px 0' }} />

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <strong>连续发送批次深度防封 (大休眠保护)</strong>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    每连续发送一定数量后，强制大幅停顿一段时间，避免触发邮件服务商的每小时峰值限制
                  </div>
                </div>
                <Switch
                  checked={enableBatchRest}
                  onChange={setEnableBatchRest}
                  checkedChildren="已启用"
                  unCheckedChildren="关闭"
                />
              </div>

              {enableBatchRest && (
                <Space align="center" size="middle" style={{ marginTop: 6 }} wrap>
                  <span>每连续发送</span>
                  <Form.Item name="batch_size" noStyle>
                    <InputNumber min={2} max={500} addonAfter="封" />
                  </Form.Item>
                  <span>邮件，额外休眠休息</span>
                  <Form.Item name="batch_rest_sec" noStyle>
                    <InputNumber min={5} max={3600} addonAfter="秒" />
                  </Form.Item>
                </Space>
              )}
            </div>

            <Divider style={{ margin: '14px 0' }} />

            <Space align="center">
              <span>单封发送失败时，自动切换下一发件箱重试：</span>
              <Form.Item name="max_retries" noStyle>
                <Select style={{ width: 130 }}>
                  <Select.Option value={0}>不重试</Select.Option>
                  <Select.Option value={1}>换箱重试 1 次</Select.Option>
                  <Select.Option value={2}>换箱重试 2 次</Select.Option>
                </Select>
              </Form.Item>
            </Space>
          </Card>

          {/* 收件人配置 */}
          <Card type="inner" title="目标收件人设置 (逐封单独投递)" style={{ marginBottom: 18 }}>
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
              extra="系统将自动解析每行收件人，发送时逐个独立生成单封信件"
            >
              <Input.TextArea
                rows={4}
                placeholder={"zhangsan@example.com\n李四,lisi@company.com\n王五 <wangwu@test.org>"}
              />
            </Form.Item>
          </Card>

          {/* 邮件正文编辑 */}
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
            <Button
              size="large"
              icon={<SaveOutlined />}
              loading={savingDraft}
              onClick={handleSaveDraft}
            >
              存为群发草稿
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<RocketOutlined />}
              loading={loading}
              onClick={() => handleSubmit(true)}
            >
              立即创建并开始逐封分摊发送
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};
