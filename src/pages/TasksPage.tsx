import React, { useEffect, useState, useRef } from 'react';
import {
  Table,
  Button,
  Tag,
  Space,
  Progress,
  Drawer,
  message,
  Popconfirm,
  Radio,
  Tooltip,
} from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  DeleteOutlined,
  UnorderedListOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { Campaign, TaskLog } from '../types/electron';

export const TasksPage: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentCampaign, setCurrentCampaign] = useState<Campaign | null>(null);
  const [logs, setLogs] = useState<TaskLog[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const timerRef = useRef<any>(null);

  const fetchCampaigns = async () => {
    try {
      const data = await window.electronAPI.getCampaigns();
      setCampaigns(data || []);
    } catch (e: any) {
      console.error(e);
    }
  };

  const fetchLogs = async (campaignId: number, status = 'all') => {
    setLogLoading(true);
    try {
      const data = await window.electronAPI.getCampaignLogs(campaignId, status);
      setLogs(data || []);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLogLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchCampaigns().finally(() => setLoading(false));

    timerRef.current = setInterval(() => {
      fetchCampaigns();
    }, 2500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    let logTimer: any = null;
    if (drawerOpen && currentCampaign && currentCampaign.status === 'running') {
      logTimer = setInterval(() => {
        fetchLogs(currentCampaign.id, statusFilter);
      }, 2500);
    }
    return () => {
      if (logTimer) clearInterval(logTimer);
    };
  }, [drawerOpen, currentCampaign, statusFilter]);

  const handleStart = async (id: number) => {
    try {
      await window.electronAPI.startCampaign(id);
      message.success('任务已启动分发');
      fetchCampaigns();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handlePause = async (id: number) => {
    try {
      await window.electronAPI.pauseCampaign(id);
      message.info('任务已暂停');
      fetchCampaigns();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await window.electronAPI.deleteCampaign(id);
      message.success('任务已删除');
      fetchCampaigns();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const openLogDrawer = (c: Campaign) => {
    setCurrentCampaign(c);
    setStatusFilter('all');
    setDrawerOpen(true);
    fetchLogs(c.id, 'all');
  };

  const columns = [
    {
      title: '任务名称 / 主题',
      dataIndex: 'title',
      render: (title: string, r: Campaign) => (
        <div>
          <strong style={{ fontSize: 14 }}>{title}</strong>
          <div style={{ fontSize: 12, color: '#666' }}>主题：{r.subject}</div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: string) => {
        const map: any = {
          draft: { color: 'default', text: '草稿', icon: null },
          running: { color: 'processing', text: '分发中', icon: <SyncOutlined spin /> },
          paused: { color: 'warning', text: '已暂停', icon: null },
          completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
          failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
        };
        const item = map[status] || { color: 'default', text: status, icon: null };
        return <Tag color={item.color} icon={item.icon}>{item.text}</Tag>;
      },
    },
    {
      title: '发送进度',
      width: 240,
      render: (_: any, r: Campaign) => {
        const percent =
          r.total_count > 0 ? Math.round((r.success_count / r.total_count) * 100) : 0;
        return (
          <div>
            <Progress
              percent={percent}
              status={r.status === 'running' ? 'active' : undefined}
              size="small"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#666' }}>
              <span>成功: <strong style={{ color: '#52c41a' }}>{r.success_count}</strong></span>
              {r.fail_count > 0 && (
                <span>失败: <strong style={{ color: '#ff4d4f' }}>{r.fail_count}</strong></span>
              )}
              <span>总计: {r.total_count} 封</span>
            </div>
          </div>
        );
      },
    },
    {
      title: '防封间隔',
      width: 110,
      render: (_: any, r: Campaign) => <span>{r.min_interval}~{r.max_interval} 秒</span>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 160,
      render: (t: string) => t?.slice(0, 16).replace('T', ' '),
    },
    {
      title: '操作',
      width: 180,
      render: (_: any, r: Campaign) => (
        <Space size="small">
          {r.status === 'running' ? (
            <Button size="small" icon={<PauseCircleOutlined />} onClick={() => handlePause(r.id)}>
              暂停
            </Button>
          ) : (
            r.status !== 'completed' && (
              <Button
                size="small"
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={() => handleStart(r.id)}
              >
                启动
              </Button>
            )
          )}
          <Button size="small" icon={<UnorderedListOutlined />} onClick={() => openLogDrawer(r)}>
            日志
          </Button>
          <Popconfirm
            title="确定删除此任务？"
            onConfirm={() => handleDelete(r.id)}
            okText="删除"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>群发任务大厅与明细监控</h3>
          <p style={{ margin: 0, color: '#888', fontSize: 13 }}>
            监控所有批量分摊发信任务的实时进度，查阅逐封邮件的投递邮箱与报错详情。
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchCampaigns}>
          刷新
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={campaigns}
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Drawer
        title={
          <div>
            <span>任务发送明细: {currentCampaign?.title}</span>
            <span style={{ fontSize: 13, color: '#888', marginLeft: 12 }}>
              ({currentCampaign?.success_count}/{currentCampaign?.total_count} 封已发送)
            </span>
          </div>
        }
        width={780}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Radio.Group
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                if (currentCampaign) fetchLogs(currentCampaign.id, e.target.value);
              }}
              size="small"
            >
              <Radio.Button value="all">全部</Radio.Button>
              <Radio.Button value="success">成功</Radio.Button>
              <Radio.Button value="failed">失败</Radio.Button>
              <Radio.Button value="pending">待发送</Radio.Button>
            </Radio.Group>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => currentCampaign && fetchLogs(currentCampaign.id, statusFilter)}
            />
          </Space>
        }
      >
        <Table
          rowKey="id"
          dataSource={logs}
          loading={logLoading}
          pagination={{ pageSize: 20 }}
          size="small"
          columns={[
            {
              title: '收件人',
              dataIndex: 'to_email',
              render: (email, r) => (
                <div>
                  <strong>{email}</strong>
                  {r.to_name && <span style={{ color: '#888', marginLeft: 6 }}>({r.to_name})</span>}
                </div>
              ),
            },
            {
              title: '分配的发信箱',
              dataIndex: 'from_email',
              render: (from) => from || <span style={{ color: '#aaa' }}>等待分配</span>,
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              render: (st, r) => {
                if (st === 'success') return <Tag color="success">成功</Tag>;
                if (st === 'failed') {
                  return (
                    <Tooltip title={r.error_msg}>
                      <Tag color="error">失败 (查看)</Tag>
                    </Tooltip>
                  );
                }
                if (st === 'sending') return <Tag color="processing">发送中</Tag>;
                return <Tag color="default">待发送</Tag>;
              },
            },
            {
              title: '错误详情',
              dataIndex: 'error_msg',
              ellipsis: true,
              render: (err) => (err ? <span style={{ color: '#ff4d4f' }}>{err}</span> : '-'),
            },
            {
              title: '发送时间',
              dataIndex: 'sent_at',
              width: 150,
              render: (t) => (t ? t.slice(0, 16).replace('T', ' ') : '-'),
            },
          ]}
        />
      </Drawer>
    </div>
  );
};
