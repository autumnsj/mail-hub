import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Card,
  Row,
  Col,
  Statistic,
  Tooltip,
  Alert,
  Typography,
} from 'antd';
import {
  SyncOutlined,
  DeleteOutlined,
  SendOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  MailOutlined,
  RocketOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { SentMail, Account } from '../types/electron';

const { Title, Text, Paragraph } = Typography;

export const SentPage: React.FC = () => {
  const navigate = useNavigate();
  const [mails, setMails] = useState<SentMail[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number>(0);
  const [sentTypeFilter, setSentTypeFilter] = useState<'all' | 'single' | 'campaign'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // 查看详情 Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeMail, setActiveMail] = useState<SentMail | null>(null);

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
      const data = await window.electronAPI.getSentMails({
        accountId: selectedAccountId > 0 ? selectedAccountId : undefined,
        sentType: sentTypeFilter,
        status: statusFilter,
        keyword: keyword.trim() || undefined,
      });
      setMails(data || []);
    } catch (e: any) {
      message.error(e.message || '获取发件箱记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetchMails();
  }, [selectedAccountId, sentTypeFilter, statusFilter, keyword]);

  const handleDelete = async (id: number) => {
    try {
      await window.electronAPI.deleteSentMail(id);
      message.success('已删除该条发件记录');
      if (activeMail?.id === id) {
        setDrawerOpen(false);
      }
      fetchMails();
    } catch (e: any) {
      message.error(e.message || '删除失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      for (const id of selectedRowKeys) {
        await window.electronAPI.deleteSentMail(Number(id));
      }
      message.success(`已批量删除 ${selectedRowKeys.length} 条记录`);
      setSelectedRowKeys([]);
      fetchMails();
    } catch (e: any) {
      message.error(e.message || '批量删除失败');
    }
  };

  const handleClearAll = async () => {
    try {
      await window.electronAPI.clearSentMails({
        accountId: selectedAccountId > 0 ? selectedAccountId : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      message.success('发件记录已清空');
      setSelectedRowKeys([]);
      setDrawerOpen(false);
      fetchMails();
    } catch (e: any) {
      message.error(e.message || '清空失败');
    }
  };

  const handleResend = (mail: SentMail) => {
    navigate('/send/single', {
      state: {
        toEmail: mail.to_email,
        toName: mail.to_name,
        subject: mail.subject,
        bodyHtml: mail.body_html,
        accountId: mail.account_id,
      },
    });
  };

  // 统计概览计算
  const todayStr = new Date().toISOString().slice(0, 10);
  const totalSent = mails.length;
  const todayCount = mails.filter(
    (m) => (m.sent_at || m.created_at || '').slice(0, 10) === todayStr
  ).length;
  const successCount = mails.filter((m) => m.status === 'success').length;
  const failedCount = mails.filter((m) => m.status === 'failed').length;
  const successRate = totalSent > 0 ? Math.round((successCount / totalSent) * 100) : 100;

  const columns = [
    {
      title: '收件人',
      key: 'recipient',
      width: 220,
      render: (_: any, record: SentMail) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1677ff' }}>{record.to_email}</div>
          {record.to_name && (
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
              称呼: <Tag style={{ margin: 0 }}>{record.to_name}</Tag>
            </div>
          )}
        </div>
      ),
    },
    {
      title: '邮件主题',
      dataIndex: 'subject',
      key: 'subject',
      ellipsis: true,
      render: (text: string, record: SentMail) => (
        <a
          onClick={() => {
            setActiveMail(record);
            setDrawerOpen(true);
          }}
          style={{ fontWeight: 500, color: '#262626' }}
        >
          {text || '(无主题)'}
        </a>
      ),
    },
    {
      title: '发信邮箱',
      key: 'from',
      width: 220,
      render: (_: any, record: SentMail) => (
        <div>
          <Text ellipsis style={{ maxWidth: 190, display: 'block' }}>
            {record.from_email}
          </Text>
          <Tag color="cyan" style={{ fontSize: 11, marginTop: 2 }}>
            {record.account_name || '已设邮箱'}
          </Tag>
        </div>
      ),
    },
    {
      title: '发送类型',
      key: 'sent_type',
      width: 140,
      render: (_: any, record: SentMail) => {
        if (record.sent_type === 'campaign') {
          return (
            <Tooltip title={`群发任务: ${record.campaign_title || '未命名任务'}`}>
              <Tag color="purple" icon={<RocketOutlined />}>
                群发分摊
              </Tag>
            </Tooltip>
          );
        }
        return (
          <Tag color="blue" icon={<SendOutlined />}>
            单封即时
          </Tag>
        );
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_: any, record: SentMail) => {
        if (record.status === 'success') {
          return (
            <Tag color="success" icon={<CheckCircleOutlined />}>
              已送达
            </Tag>
          );
        }
        return (
          <Tooltip title={record.error_msg || '投递未成功'}>
            <Tag color="error" icon={<CloseCircleOutlined />} style={{ cursor: 'pointer' }}>
              失败
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '发送时间',
      dataIndex: 'sent_at',
      key: 'sent_at',
      width: 170,
      render: (val: string, record: SentMail) => {
        const timeStr = val || record.created_at;
        return (
          <span style={{ color: '#8c8c8c', fontSize: 13 }}>
            {timeStr ? timeStr.slice(0, 19).replace('T', ' ') : '-'}
          </span>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      render: (_: any, record: SentMail) => (
        <Space size="middle">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setActiveMail(record);
              setDrawerOpen(true);
            }}
          >
            查看
          </Button>
          <Button
            type="link"
            size="small"
            icon={<SendOutlined />}
            onClick={() => handleResend(record)}
          >
            再发
          </Button>
          <Popconfirm
            title="确认删除此条已发记录？"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* 顶部标题与说明 */}
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          发件箱 (已发送邮件)
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          实时归档所有由本客户端成功发出的即时邮件与群发邮件，支持查看完整渲染正文、状态追踪与再次快速投递。
        </Paragraph>
      </div>

      {/* 顶部统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="当前发件总量"
              value={totalSent}
              suffix="封"
              prefix={<MailOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="今日发送"
              value={todayCount}
              suffix="封"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="发送成功率"
              value={successRate}
              suffix="%"
              valueStyle={{ color: successRate >= 90 ? '#52c41a' : '#faad14' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="投递失败数"
              value={failedCount}
              suffix="封"
              valueStyle={{ color: failedCount > 0 ? '#ff4d4f' : '#8c8c8c' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 筛选与操作工具栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Space wrap>
            <Select
              style={{ width: 190 }}
              value={selectedAccountId}
              onChange={setSelectedAccountId}
            >
              <Select.Option value={0}>全部发信邮箱</Select.Option>
              {accounts.map((a) => (
                <Select.Option key={a.id} value={a.id}>
                  {a.name} ({a.from_email})
                </Select.Option>
              ))}
            </Select>

            <Select
              style={{ width: 130 }}
              value={sentTypeFilter}
              onChange={setSentTypeFilter}
            >
              <Select.Option value="all">全部类型</Select.Option>
              <Select.Option value="single">单封即时</Select.Option>
              <Select.Option value="campaign">群发分摊</Select.Option>
            </Select>

            <Select
              style={{ width: 120 }}
              value={statusFilter}
              onChange={setStatusFilter}
            >
              <Select.Option value="all">全部状态</Select.Option>
              <Select.Option value="success">发送成功</Select.Option>
              <Select.Option value="failed">发送失败</Select.Option>
            </Select>

            <Input.Search
              placeholder="搜索收件人/主题/发件箱..."
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={fetchMails}
              style={{ width: 230 }}
            />

            <Button icon={<SyncOutlined spin={loading} />} onClick={fetchMails}>
              刷新
            </Button>
          </Space>

          <Space>
            {selectedRowKeys.length > 0 && (
              <Popconfirm
                title={`确定批量删除选中的 ${selectedRowKeys.length} 封邮件记录？`}
                okText="确认删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={handleBatchDelete}
              >
                <Button danger icon={<DeleteOutlined />}>
                  批量删除 ({selectedRowKeys.length})
                </Button>
              </Popconfirm>
            )}

            <Popconfirm
              title={
                selectedAccountId > 0 || statusFilter !== 'all'
                  ? '确认清空当前筛选条件下的发件记录？'
                  : '确认清空所有已发送记录？此操作不可逆！'
              }
              okText="确认清空"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={handleClearAll}
            >
              <Button icon={<ClearOutlined />} danger>
                清空记录
              </Button>
            </Popconfirm>
          </Space>
        </div>
      </Card>

      {/* 邮件列表表格 */}
      <Card bodyStyle={{ padding: 0 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={mails}
          loading={loading}
          pagination={{
            pageSize: 15,
            showTotal: (total) => `共 ${total} 封发件记录`,
            showQuickJumper: true,
          }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
        />
      </Card>

      {/* 查看已发送邮件详情 Drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>已发邮件详情</span>
            {activeMail && (
              <Tag color={activeMail.status === 'success' ? 'success' : 'error'}>
                {activeMail.status === 'success' ? '发送成功' : '发送失败'}
              </Tag>
            )}
            {activeMail && (
              <Tag color={activeMail.sent_type === 'campaign' ? 'purple' : 'blue'}>
                {activeMail.sent_type === 'campaign'
                  ? `群发任务: ${activeMail.campaign_title || ''}`
                  : '单封即时发送'}
              </Tag>
            )}
          </div>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={760}
        extra={
          activeMail && (
            <Space>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => handleResend(activeMail)}
              >
                再次编辑发送
              </Button>
              <Popconfirm
                title="确认删除该条发件记录？"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDelete(activeMail.id)}
              >
                <Button danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          )
        }
      >
        {activeMail && (
          <div>
            {/* 失败错误提示 */}
            {activeMail.status === 'failed' && activeMail.error_msg && (
              <Alert
                type="error"
                showIcon
                message="投递失败原因"
                description={activeMail.error_msg}
                style={{ marginBottom: 16 }}
              />
            )}

            {/* 邮件头信息 */}
            <div
              style={{
                background: '#fafafa',
                padding: '12px 16px',
                borderRadius: 8,
                marginBottom: 16,
                border: '1px solid #f0f0f0',
                fontSize: 13,
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <strong style={{ display: 'inline-block', width: 75, color: '#595959' }}>
                  邮件主题：
                </strong>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#262626' }}>
                  {activeMail.subject || '(无主题)'}
                </span>
              </div>
              <div style={{ marginBottom: 6 }}>
                <strong style={{ display: 'inline-block', width: 75, color: '#595959' }}>
                  收件人：
                </strong>
                <span style={{ color: '#1677ff', fontWeight: 500 }}>{activeMail.to_email}</span>
                {activeMail.to_name && (
                  <span style={{ color: '#8c8c8c', marginLeft: 6 }}>
                    ({activeMail.to_name})
                  </span>
                )}
              </div>
              <div style={{ marginBottom: 6 }}>
                <strong style={{ display: 'inline-block', width: 75, color: '#595959' }}>
                  发件邮箱：
                </strong>
                <span>{activeMail.from_email}</span>
                <Tag color="cyan" style={{ marginLeft: 8 }}>
                  发件配置: {activeMail.account_name}
                </Tag>
              </div>
              <div>
                <strong style={{ display: 'inline-block', width: 75, color: '#595959' }}>
                  发送时间：
                </strong>
                <span style={{ color: '#8c8c8c' }}>
                  {(activeMail.sent_at || activeMail.created_at || '')
                    .slice(0, 19)
                    .replace('T', ' ')}
                </span>
              </div>
            </div>

            {/* 邮件正文渲染 (安全沙箱 iframe) */}
            <div>
              <div
                style={{
                  marginBottom: 8,
                  fontWeight: 600,
                  color: '#595959',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>邮件正文预览：</span>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>已采用沙箱隔离渲染</span>
              </div>
              {activeMail.body_html ? (
                <iframe
                  title="sent-mail-body"
                  srcDoc={activeMail.body_html}
                  sandbox="allow-same-origin allow-popups"
                  style={{
                    width: '100%',
                    minHeight: 480,
                    border: '1px solid #d9d9d9',
                    borderRadius: 6,
                    background: '#fff',
                  }}
                />
              ) : (
                <div
                  style={{
                    padding: 24,
                    background: '#f5f5f5',
                    borderRadius: 6,
                    color: '#8c8c8c',
                    textAlign: 'center',
                  }}
                >
                  (此邮件无正文内容)
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
