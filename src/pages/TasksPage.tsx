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
  Alert,
  Modal,
  Form,
  InputNumber,
  Switch,
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
  SettingOutlined,
  DashboardOutlined,
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

  // 调速模态框
  const [speedModalOpen, setSpeedModalOpen] = useState(false);
  const [editingCamp, setEditingCamp] = useState<Campaign | null>(null);
  const [speedForm] = Form.useForm();

  const timerRef = useRef<any>(null);

  const fetchCampaigns = async () => {
    try {
      const data = await window.electronAPI.getCampaigns();
      setCampaigns(data || []);
      // 如果当前正打开 drawer，更新当前任务引用
      if (currentCampaign) {
        const found = (data || []).find((c) => c.id === currentCampaign.id);
        if (found) setCurrentCampaign(found);
      }
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
    }, 2000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    let logTimer: any = null;
    if (drawerOpen && currentCampaign && currentCampaign.status === 'running') {
      logTimer = setInterval(() => {
        fetchLogs(currentCampaign.id, statusFilter);
      }, 2000);
    }
    return () => {
      if (logTimer) clearInterval(logTimer);
    };
  }, [drawerOpen, currentCampaign, statusFilter]);

  const handleStart = async (id: number) => {
    try {
      await window.electronAPI.startCampaign(id);
      message.success('任务已启动，正在逐封独立发送');
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

  const openSpeedModal = (c: Campaign) => {
    setEditingCamp(c);
    speedForm.setFieldsValue({
      min_interval: c.min_interval || 3,
      max_interval: c.max_interval || 8,
      enable_batch_rest: c.enable_batch_rest !== false,
      batch_size: c.batch_size || 10,
      batch_rest_sec: c.batch_rest_sec || 30,
    });
    setSpeedModalOpen(true);
  };

  const handleSaveSpeed = async () => {
    try {
      const values = await speedForm.validateFields();
      if (!editingCamp) return;
      await window.electronAPI.updateCampaignConfig({
        id: editingCamp.id,
        min_interval: values.min_interval,
        max_interval: values.max_interval,
        enable_batch_rest: values.enable_batch_rest,
        batch_size: values.batch_size,
        batch_rest_sec: values.batch_rest_sec,
      });
      message.success('发送速率与抖动参数已更新');
      setSpeedModalOpen(false);
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

  // 检查是否有正在运行的任务
  const runningCampaign = campaigns.find((c) => c.status === 'running');

  const columns = [
    {
      title: '任务名称 / 主题',
      dataIndex: 'title',
      render: (title: string, r: Campaign) => (
        <div>
          <strong style={{ fontSize: 14 }}>{title}</strong>
          <div style={{ fontSize: 12, color: '#666' }}>主题：{r.subject}</div>
          {r.current_delay_info && r.status === 'running' && (
            <div style={{ fontSize: 12, color: '#1677ff', marginTop: 3 }}>
              ⚡ 实时: {r.current_delay_info}
            </div>
          )}
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
          running: { color: 'processing', text: '逐封发送中', icon: <SyncOutlined spin /> },
          paused: { color: 'warning', text: '已暂停', icon: null },
          completed: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
          failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
        };
        const item = map[status] || { color: 'default', text: status, icon: null };
        return <Tag color={item.color} icon={item.icon}>{item.text}</Tag>;
      },
    },
    {
      title: '发送进度 (逐封推进)',
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
      title: '防封抖动设置',
      width: 140,
      render: (_: any, r: Campaign) => (
        <div>
          <div>{r.min_interval}~{r.max_interval} 秒/封</div>
          {r.enable_batch_rest && (
            <div style={{ fontSize: 11, color: '#888' }}>
              每{r.batch_size}封休{r.batch_rest_sec}s
            </div>
          )}
        </div>
      ),
    },
    {
      title: '操作',
      width: 220,
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
          <Button size="small" icon={<SettingOutlined />} onClick={() => openSpeedModal(r)}>
            调速
          </Button>
          <Button size="small" icon={<UnorderedListOutlined />} onClick={() => openLogDrawer(r)}>
            流水
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
          <h3 style={{ margin: 0 }}>群发任务大厅 (逐封独立发送调度)</h3>
          <p style={{ margin: 0, color: '#888', fontSize: 13 }}>
            每封邮件均以独立信件发出，系统在发信间隙自动执行您设置的随机浮动抖动，避开服务商风控。
          </p>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchCampaigns}>
          刷新
        </Button>
      </div>

      {runningCampaign && (
        <Alert
          type="info"
          showIcon
          icon={<SyncOutlined spin />}
          style={{ marginBottom: 16 }}
          message={`正在逐封发送: ${runningCampaign.title}`}
          description={
            <div>
              <div>当前动态: <strong>{runningCampaign.current_delay_info || '调度中...'}</strong></div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                已完成: {runningCampaign.success_count} / {runningCampaign.total_count} 封 | 防封抖动配置: {runningCampaign.min_interval}~{runningCampaign.max_interval} 秒
              </div>
            </div>
          }
        />
      )}

      <Table
        rowKey="id"
        columns={columns}
        dataSource={campaigns}
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      {/* 调整速率与抖动模态框 */}
      <Modal
        title={`调整任务发送速率与抖动参数: ${editingCamp?.title}`}
        open={speedModalOpen}
        onOk={handleSaveSpeed}
        onCancel={() => setSpeedModalOpen(false)}
        okText="保存并即时生效"
        cancelText="取消"
      >
        <Form form={speedForm} layout="vertical">
          <Form.Item label="单封之间随机抖动延时 (秒)" required>
            <Space align="center">
              <span>最短：</span>
              <Form.Item name="min_interval" noStyle rules={[{ required: true }]}>
                <InputNumber min={1} max={60} addonAfter="秒" />
              </Form.Item>
              <span>至 最长：</span>
              <Form.Item name="max_interval" noStyle rules={[{ required: true }]}>
                <InputNumber min={1} max={180} addonAfter="秒" />
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item name="enable_batch_rest" label="批次深度休息保护" valuePropName="checked">
            <Switch checkedChildren="已开启" unCheckedChildren="关闭" />
          </Form.Item>

          <Space align="center" style={{ marginBottom: 16 }}>
            <span>每发送</span>
            <Form.Item name="batch_size" noStyle>
              <InputNumber min={2} max={500} addonAfter="封" />
            </Form.Item>
            <span>额外休眠</span>
            <Form.Item name="batch_rest_sec" noStyle>
              <InputNumber min={5} max={3600} addonAfter="秒" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* 逐封发送明细流水 Drawer */}
      <Drawer
        title={
          <div>
            <span>逐封发送明细: {currentCampaign?.title}</span>
            <span style={{ fontSize: 13, color: '#888', marginLeft: 12 }}>
              ({currentCampaign?.success_count}/{currentCampaign?.total_count} 封已发出)
            </span>
          </div>
        }
        width={800}
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
              title: '独立收件人',
              dataIndex: 'to_email',
              render: (email, r) => (
                <div>
                  <strong>{email}</strong>
                  {r.to_name && <span style={{ color: '#888', marginLeft: 6 }}>({r.to_name})</span>}
                </div>
              ),
            },
            {
              title: '使用的发信箱',
              dataIndex: 'from_email',
              render: (from) => from || <span style={{ color: '#aaa' }}>等待轮换分配</span>,
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
                if (st === 'sending') return <Tag color="processing">投递中</Tag>;
                return <Tag color="default">排队待发</Tag>;
              },
            },
            {
              title: '服务商返回详情 / 错误',
              dataIndex: 'error_msg',
              ellipsis: true,
              render: (err) => (err ? <span style={{ color: '#ff4d4f' }}>{err}</span> : '-'),
            },
            {
              title: '发出时间',
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
