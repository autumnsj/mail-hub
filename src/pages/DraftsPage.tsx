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
  Typography,
} from 'antd';
import {
  SyncOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  SendOutlined,
  RocketOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { DraftMail } from '../types/electron';

const { Title, Text, Paragraph } = Typography;

export const DraftsPage: React.FC = () => {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<DraftMail[]>([]);
  const [draftTypeFilter, setDraftTypeFilter] = useState<'all' | 'single' | 'campaign'>('all');
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // 查看预览 Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeDraft, setActiveDraft] = useState<DraftMail | null>(null);

  const fetchDrafts = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getDrafts({
        draftType: draftTypeFilter,
        keyword: keyword.trim() || undefined,
      });
      setDrafts(data || []);
    } catch (e: any) {
      message.error(e.message || '获取草稿列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrafts();
  }, [draftTypeFilter, keyword]);

  const handleDelete = async (id: number) => {
    try {
      await window.electronAPI.deleteDraft(id);
      message.success('已删除该草稿');
      if (activeDraft?.id === id) {
        setDrawerOpen(false);
      }
      fetchDrafts();
    } catch (e: any) {
      message.error(e.message || '删除草稿失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      for (const id of selectedRowKeys) {
        await window.electronAPI.deleteDraft(Number(id));
      }
      message.success(`已批量删除 ${selectedRowKeys.length} 封草稿`);
      setSelectedRowKeys([]);
      fetchDrafts();
    } catch (e: any) {
      message.error(e.message || '批量删除失败');
    }
  };

  const handleClearAll = async () => {
    try {
      await window.electronAPI.clearDrafts({
        draftType: draftTypeFilter !== 'all' ? draftTypeFilter : undefined,
      });
      message.success('草稿箱已清空');
      setSelectedRowKeys([]);
      setDrawerOpen(false);
      fetchDrafts();
    } catch (e: any) {
      message.error(e.message || '清空失败');
    }
  };

  const handleContinueEdit = (draft: DraftMail) => {
    if (draft.draft_type === 'campaign') {
      navigate('/send/batch', {
        state: {
          draftId: draft.id,
          title: draft.title,
          subject: draft.subject,
          bodyHtml: draft.body_html,
          account_ids: draft.account_ids,
          group_ids: draft.group_ids,
          recipients_text: draft.recipients_text,
          min_interval: draft.min_interval,
          max_interval: draft.max_interval,
          send_mode: draft.send_mode,
          target_duration_minutes: draft.target_duration_minutes,
        },
      });
    } else {
      navigate('/send/single', {
        state: {
          draftId: draft.id,
          toEmail: draft.to_email,
          toName: draft.to_name,
          subject: draft.subject,
          bodyHtml: draft.body_html,
          accountId: draft.account_id,
        },
      });
    }
  };

  const singleDraftsCount = drafts.filter((d) => d.draft_type === 'single').length;
  const campaignDraftsCount = drafts.filter((d) => d.draft_type === 'campaign').length;

  const columns = [
    {
      title: '草稿标题 / 邮件主题',
      key: 'subject',
      ellipsis: true,
      render: (_: any, record: DraftMail) => (
        <div>
          <a
            onClick={() => handleContinueEdit(record)}
            style={{ fontWeight: 600, color: '#1677ff', fontSize: 14 }}
          >
            {record.subject || record.title || '(未命名草稿)'}
          </a>
          {record.draft_type === 'campaign' && record.title && (
            <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
              任务标识: {record.title}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '草稿类型',
      key: 'draft_type',
      width: 140,
      render: (_: any, record: DraftMail) => {
        if (record.draft_type === 'campaign') {
          return (
            <Tag color="purple" icon={<RocketOutlined />}>
              群发任务草稿
            </Tag>
          );
        }
        return (
          <Tag color="blue" icon={<SendOutlined />}>
            单封即时草稿
          </Tag>
        );
      },
    },
    {
      title: '预设收件人 / 目标',
      key: 'recipient',
      width: 240,
      ellipsis: true,
      render: (_: any, record: DraftMail) => {
        if (record.draft_type === 'campaign') {
          const textCount = record.recipients_text
            ? record.recipients_text.split('\n').filter((l) => l.trim()).length
            : 0;
          const groupCount = record.group_ids ? record.group_ids.length : 0;
          return (
            <span style={{ color: '#595959', fontSize: 13 }}>
              {groupCount > 0 && <Tag color="cyan">{groupCount} 个分组</Tag>}
              {textCount > 0 && <Tag color="geekblue">{textCount} 个输入目标</Tag>}
              {groupCount === 0 && textCount === 0 && <span style={{ color: '#bfbfbf' }}>未设定收件人</span>}
            </span>
          );
        }
        return record.to_email ? (
          <div>
            <Text style={{ color: '#262626' }}>{record.to_email}</Text>
            {record.to_name && (
              <Tag style={{ marginLeft: 6, fontSize: 11 }}>{record.to_name}</Tag>
            )}
          </div>
        ) : (
          <span style={{ color: '#bfbfbf' }}>未填写收件人</span>
        );
      },
    },
    {
      title: '预设发信邮箱',
      key: 'sender',
      width: 200,
      render: (_: any, record: DraftMail) => {
        if (record.draft_type === 'campaign') {
          const count = record.account_ids ? record.account_ids.length : 0;
          return count > 0 ? (
            <Tag color="green">已选 {count} 个发件邮箱轮询</Tag>
          ) : (
            <span style={{ color: '#bfbfbf' }}>未指定发件箱</span>
          );
        }
        return record.from_email ? (
          <div>
            <Text ellipsis style={{ maxWidth: 180, display: 'block' }}>
              {record.from_email}
            </Text>
            {record.account_name && (
              <Tag color="cyan" style={{ fontSize: 11, marginTop: 2 }}>
                {record.account_name}
              </Tag>
            )}
          </div>
        ) : (
          <span style={{ color: '#bfbfbf' }}>未选择发件邮箱</span>
        );
      },
    },
    {
      title: '最后保存时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      render: (val: string, record: DraftMail) => {
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
      width: 180,
      render: (_: any, record: DraftMail) => (
        <Space size="middle">
          <Button
            type="primary"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleContinueEdit(record)}
          >
            编辑发送
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setActiveDraft(record);
              setDrawerOpen(true);
            }}
          >
            预览
          </Button>
          <Popconfirm
            title="确认删除该草稿？"
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
      {/* 顶部标题 */}
      <div style={{ marginBottom: 16 }}>
        <Title level={3} style={{ marginBottom: 4 }}>
          草稿箱 (邮件草稿)
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          本地保存所有未发送完毕的即时单发与多邮箱群发邮件草稿，随时可再次打开、修改富文本正文并快速投递。
        </Paragraph>
      </div>

      {/* 顶部统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="草稿总数"
              value={drafts.length}
              suffix="封"
              prefix={<FileTextOutlined style={{ color: '#1677ff' }} />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="单封即时草稿"
              value={singleDraftsCount}
              suffix="封"
              valueStyle={{ color: '#1677ff' }}
              prefix={<SendOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="群发任务草稿"
              value={campaignDraftsCount}
              suffix="个"
              valueStyle={{ color: '#722ed1' }}
              prefix={<RocketOutlined />}
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
              style={{ width: 160 }}
              value={draftTypeFilter}
              onChange={setDraftTypeFilter}
            >
              <Select.Option value="all">全部草稿类型</Select.Option>
              <Select.Option value="single">单封即时草稿</Select.Option>
              <Select.Option value="campaign">群发任务草稿</Select.Option>
            </Select>

            <Input.Search
              placeholder="搜索主题/收件人/任务名..."
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onSearch={fetchDrafts}
              style={{ width: 260 }}
            />

            <Button icon={<SyncOutlined spin={loading} />} onClick={fetchDrafts}>
              刷新
            </Button>
          </Space>

          <Space>
            {selectedRowKeys.length > 0 && (
              <Popconfirm
                title={`确定批量删除选中的 ${selectedRowKeys.length} 封草稿？`}
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
                draftTypeFilter !== 'all'
                  ? '确认清空当前类型下的草稿？'
                  : '确认清空草稿箱中的所有草稿？此操作不可逆！'
              }
              okText="确认清空"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={handleClearAll}
            >
              <Button icon={<ClearOutlined />} danger>
                清空草稿
              </Button>
            </Popconfirm>
          </Space>
        </div>
      </Card>

      {/* 草稿列表表格 */}
      <Card bodyStyle={{ padding: 0 }}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={drafts}
          loading={loading}
          pagination={{
            pageSize: 15,
            showTotal: (total) => `共 ${total} 封草稿`,
            showQuickJumper: true,
          }}
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
        />
      </Card>

      {/* 查看草稿详情预览 Drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>草稿预览</span>
            {activeDraft && (
              <Tag color={activeDraft.draft_type === 'campaign' ? 'purple' : 'blue'}>
                {activeDraft.draft_type === 'campaign' ? '群发任务草稿' : '单封即时草稿'}
              </Tag>
            )}
          </div>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={760}
        extra={
          activeDraft && (
            <Space>
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => handleContinueEdit(activeDraft)}
              >
                继续编辑并发送
              </Button>
              <Popconfirm
                title="确认删除该草稿？"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDelete(activeDraft.id)}
              >
                <Button danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          )
        }
      >
        {activeDraft && (
          <div>
            {/* 草稿头部信息 */}
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
                  {activeDraft.subject || activeDraft.title || '(未命名草稿)'}
                </span>
              </div>
              {activeDraft.draft_type === 'single' ? (
                <>
                  <div style={{ marginBottom: 6 }}>
                    <strong style={{ display: 'inline-block', width: 75, color: '#595959' }}>
                      收件人：
                    </strong>
                    <span style={{ color: '#1677ff', fontWeight: 500 }}>
                      {activeDraft.to_email || '(未填写)'}
                    </span>
                    {activeDraft.to_name && (
                      <span style={{ color: '#8c8c8c', marginLeft: 6 }}>
                        ({activeDraft.to_name})
                      </span>
                    )}
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong style={{ display: 'inline-block', width: 75, color: '#595959' }}>
                      发件邮箱：
                    </strong>
                    <span>{activeDraft.from_email || '(未指定)'}</span>
                    {activeDraft.account_name && (
                      <Tag color="cyan" style={{ marginLeft: 8 }}>
                        {activeDraft.account_name}
                      </Tag>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 6 }}>
                    <strong style={{ display: 'inline-block', width: 75, color: '#595959' }}>
                      群发标识：
                    </strong>
                    <span>{activeDraft.title || '(未命名任务)'}</span>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <strong style={{ display: 'inline-block', width: 75, color: '#595959' }}>
                      发件箱轮询：
                    </strong>
                    <span>
                      已选 {activeDraft.account_ids ? activeDraft.account_ids.length : 0} 个发信邮箱
                    </span>
                  </div>
                </>
              )}
              <div>
                <strong style={{ display: 'inline-block', width: 75, color: '#595959' }}>
                  保存时间：
                </strong>
                <span style={{ color: '#8c8c8c' }}>
                  {(activeDraft.updated_at || activeDraft.created_at || '')
                    .slice(0, 19)
                    .replace('T', ' ')}
                </span>
              </div>
            </div>

            {/* 正文渲染 */}
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
                <span>正文内容预览：</span>
                <span style={{ fontSize: 12, color: '#8c8c8c' }}>沙箱隔离渲染</span>
              </div>
              {activeDraft.body_html ? (
                <iframe
                  title="draft-mail-body"
                  srcDoc={activeDraft.body_html}
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
                  (此草稿尚无正文内容)
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
