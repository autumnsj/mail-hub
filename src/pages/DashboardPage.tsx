import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Button, Space, Table, Tag, Typography, Progress, message } from 'antd';
import {
  MailOutlined,
  SendOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClusterOutlined,
  ExportOutlined,
  ImportOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { SystemStats, Campaign } from '../types/electron';

const { Title, Paragraph } = Typography;

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<SystemStats>({
    accounts_count: 0,
    contacts_count: 0,
    campaigns_count: 0,
    total_success: 0,
    total_fail: 0,
  });
  const [recentCampaigns, setRecentCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const statsRes = await window.electronAPI.getStats();
      setStats(statsRes);
      const campRes = await window.electronAPI.getCampaigns();
      setRecentCampaigns((campRes || []).slice(0, 5));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalSends = stats.total_success + stats.total_fail;
  const successRate = totalSends > 0 ? Math.round((stats.total_success / totalSends) * 100) : 100;

  const handleExportBackup = async () => {
    try {
      const res = await window.electronAPI.exportBackup();
      if (res.success) {
        message.success('完整数据备份导出成功！');
      }
    } catch (e: any) {
      message.error(e.message || '备份失败');
    }
  };

  const handleImportBackup = async () => {
    try {
      const res = await window.electronAPI.importBackup();
      if (res.success) {
        message.success('数据备份恢复成功！');
        fetchData();
      }
    } catch (e: any) {
      message.error(e.message || '恢复失败');
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <div>
          <Title level={3} style={{ marginBottom: 4 }}>
            Mail Hub 邮箱管理器
          </Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>
            纯本地桌面应用，支持多邮箱轮询分摊发信、IMAP 收信与快捷回复、自由富文本编辑。
          </Paragraph>
        </div>
        <Space>
          <Button icon={<ExportOutlined />} onClick={handleExportBackup}>
            备份数据
          </Button>
          <Button icon={<ImportOutlined />} onClick={handleImportBackup}>
            恢复备份
          </Button>
          <Button
            type="primary"
            icon={<ClusterOutlined />}
            size="middle"
            onClick={() => navigate('/send/batch')}
          >
            发起多邮箱分摊群发
          </Button>
          <Button icon={<SendOutlined />} size="middle" onClick={() => navigate('/send/single')}>
            单封即时发送
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: '#f0f5ff' }}>
            <Statistic
              title="配置发件箱"
              value={stats.accounts_count}
              suffix="个"
              prefix={<MailOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: '#f6ffed' }}>
            <Statistic
              title="累计成功发信"
              value={stats.total_success}
              suffix="封"
              valueStyle={{ color: '#52c41a' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: '#fff2e8' }}>
            <Statistic
              title="发信成功率"
              value={successRate}
              suffix="%"
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ background: '#fff1f0' }}>
            <Statistic
              title="发送失败"
              value={stats.total_fail}
              suffix="封"
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<CloseCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="近期群发任务"
        extra={<Button type="link" onClick={() => navigate('/tasks')}>查看全部任务 →</Button>}
      >
        <Table
          rowKey="id"
          dataSource={recentCampaigns}
          loading={loading}
          pagination={false}
          columns={[
            {
              title: '任务名称',
              dataIndex: 'title',
              render: (text, record) => (
                <div>
                  <strong>{text}</strong>
                  <div style={{ fontSize: 12, color: '#888' }}>主题：{record.subject}</div>
                </div>
              ),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 120,
              render: (status) => {
                const map: any = {
                  draft: { color: 'default', text: '草稿' },
                  running: { color: 'processing', text: '正在分发' },
                  paused: { color: 'warning', text: '已暂停' },
                  completed: { color: 'success', text: '已完成' },
                  failed: { color: 'error', text: '失败' },
                };
                const item = map[status] || { color: 'default', text: status };
                return <Tag color={item.color}>{item.text}</Tag>;
              },
            },
            {
              title: '进度',
              width: 220,
              render: (_, record) => {
                const percent =
                  record.total_count > 0
                    ? Math.round((record.success_count / record.total_count) * 100)
                    : 0;
                return (
                  <div>
                    <Progress percent={percent} size="small" />
                    <span style={{ fontSize: 12, color: '#666' }}>
                      {record.success_count} / {record.total_count} 封
                    </span>
                  </div>
                );
              },
            },
            {
              title: '创建时间',
              dataIndex: 'created_at',
              width: 170,
              render: (t) => t?.slice(0, 16).replace('T', ' '),
            },
            {
              title: '操作',
              width: 100,
              render: () => (
                <Button size="small" type="link" onClick={() => navigate('/tasks')}>
                  查看明细
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};
