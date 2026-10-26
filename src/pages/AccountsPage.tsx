import React, { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Tag,
  Popconfirm,
  message,
  Alert,
  Tooltip,
  Collapse,
} from 'antd';
import {
  PlusOutlined,
  ThunderboltOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  ExportOutlined,
  ImportOutlined,
} from '@ant-design/icons';
import { Account } from '../types/electron';

export const AccountsPage: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [testingAccount, setTestingAccount] = useState<Account | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingImap, setTestingImap] = useState(false);

  const [form] = Form.useForm();
  const watchedHost = Form.useWatch('host', form);
  const watchedFromEmail = Form.useWatch('from_email', form);
  const isGmail =
    (watchedHost && watchedHost.includes('gmail')) ||
    (watchedFromEmail && watchedFromEmail.includes('@gmail.com'));

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getAccounts();
      setAccounts(data || []);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const openCreateModal = () => {
    setEditingAccount(null);
    form.resetFields();
    form.setFieldsValue({
      port: 465,
      use_ssl: true,
      daily_limit: 500,
      status: 'active',
      enable_inbound: true,
      imap_port: 993,
      imap_use_ssl: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (acc: Account) => {
    setEditingAccount(acc);
    form.setFieldsValue(acc);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      await window.electronAPI.saveAccount({
        ...values,
        id: editingAccount ? editingAccount.id : undefined,
      });
      message.success(editingAccount ? '更新配置成功' : '添加邮箱成功');
      setModalOpen(false);
      fetchAccounts();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await window.electronAPI.deleteAccount(id);
      message.success('删除成功');
      fetchAccounts();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // 导出发件箱配置文件 (JSON)
  const handleExportAccounts = async () => {
    try {
      const res = await window.electronAPI.exportAccounts();
      if (res.success) {
        message.success(`成功导出 ${res.count} 个发件箱配置至文件！`);
      }
    } catch (e: any) {
      message.error(e.message || '导出失败');
    }
  };

  // 从文件导入发件箱配置 (JSON)
  const handleImportAccounts = async () => {
    try {
      const res = await window.electronAPI.importAccounts('merge');
      if (res.success) {
        message.success(`成功导入并更新了 ${res.count} 个发件箱配置！`);
        fetchAccounts();
      }
    } catch (e: any) {
      message.error(e.message || '导入失败');
    }
  };

  const applyPreset = (preset: 'qq' | '163' | 'gmail' | 'aliyun' | 'tencent_ex') => {
    const presets: Record<string, Partial<Account>> = {
      qq: {
        host: 'smtp.qq.com',
        port: 465,
        use_ssl: true,
        name: 'QQ邮箱',
        imap_host: 'imap.qq.com',
        imap_port: 993,
        imap_use_ssl: true,
        enable_inbound: true,
      },
      '163': {
        host: 'smtp.163.com',
        port: 465,
        use_ssl: true,
        name: '163网易邮箱',
        imap_host: 'imap.163.com',
        imap_port: 993,
        imap_use_ssl: true,
        enable_inbound: true,
      },
      gmail: {
        host: 'smtp.gmail.com',
        port: 587,
        use_ssl: false,
        name: 'Gmail',
        imap_host: 'imap.gmail.com',
        imap_port: 993,
        imap_use_ssl: true,
        enable_inbound: true,
      },
      aliyun: {
        host: 'smtp.mxhichina.com',
        port: 465,
        use_ssl: true,
        name: '阿里企业邮箱',
        imap_host: 'imap.mxhichina.com',
        imap_port: 993,
        imap_use_ssl: true,
        enable_inbound: true,
      },
      tencent_ex: {
        host: 'smtp.exmail.qq.com',
        port: 465,
        use_ssl: true,
        name: '腾讯企业邮箱',
        imap_host: 'imap.exmail.qq.com',
        imap_port: 993,
        imap_use_ssl: true,
        enable_inbound: true,
      },
    };
    form.setFieldsValue(presets[preset]);
  };

  const handleTestSmtp = async () => {
    if (!testEmail) {
      message.warning('请输入接收测试邮件的邮箱');
      return;
    }
    setTestingSmtp(true);
    try {
      await window.electronAPI.testSmtp(testingAccount!, testEmail);
      message.success('SMTP 测试发信成功！已送达 ' + testEmail);
    } catch (e: any) {
      message.error(e.message || 'SMTP 测试失败');
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleTestImap = async () => {
    if (!testingAccount) return;
    setTestingImap(true);
    try {
      await window.electronAPI.testImap(testingAccount);
      message.success('IMAP 收信登录成功！协议通畅');
    } catch (e: any) {
      message.error(e.message || 'IMAP 测试失败');
    } finally {
      setTestingImap(false);
    }
  };

  const columns = [
    {
      title: '邮箱别名 / 账号',
      dataIndex: 'name',
      render: (text: string, r: Account) => (
        <div>
          <strong>{text}</strong>
          <div style={{ fontSize: 12, color: '#888' }}>
            {r.from_name ? `${r.from_name} <${r.from_email}>` : r.from_email}
          </div>
        </div>
      ),
    },
    {
      title: '服务协议',
      render: (_: any, r: Account) => (
        <div style={{ fontSize: 13 }}>
          <div>
            <Tag color="geekblue">SMTP</Tag> <code>{r.host}:{r.port}</code>
          </div>
          {r.enable_inbound && (
            <div style={{ marginTop: 4 }}>
              <Tag color="cyan">IMAP</Tag> <code>{r.imap_host || '自动'}:{r.imap_port || 993}</code>
            </div>
          )}
        </div>
      ),
    },
    {
      title: '今日已发 / 单日上限',
      render: (_: any, r: Account) => {
        const isNearLimit = r.daily_limit > 0 && r.sent_today >= r.daily_limit;
        return (
          <div>
            <span style={{ fontWeight: 600, color: isNearLimit ? '#ff4d4f' : '#1677ff' }}>
              {r.sent_today}
            </span>{' '}
            / {r.daily_limit > 0 ? `${r.daily_limit} 封` : '无限制'}
            {isNearLimit && <Tag color="error" style={{ marginLeft: 6 }}>已达上限</Tag>}
          </div>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: (status: string, r: Account) => {
        if (r.last_error) {
          return (
            <Tooltip title={r.last_error}>
              <Tag color="error" icon={<CloseCircleOutlined />}>错误</Tag>
            </Tooltip>
          );
        }
        return status === 'active' ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>正常</Tag>
        ) : (
          <Tag color="default">停用</Tag>
        );
      },
    },
    {
      title: '操作',
      width: 220,
      render: (_: any, r: Account) => (
        <Space size="small">
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={() => {
              setTestingAccount(r);
              setTestModalOpen(true);
            }}
          >
            连通测试
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(r)}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除此邮箱？"
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
          <h3 style={{ margin: 0 }}>发件与收件邮箱配置</h3>
          <p style={{ margin: 0, color: '#888', fontSize: 13 }}>
            配置 SMTP 发信与 IMAP 收信账号。群发时自动在勾选的邮箱之间轮询分摊发信配额。
          </p>
        </div>
        <Space>
          <Button icon={<ExportOutlined />} onClick={handleExportAccounts}>
            导出配置 (JSON)
          </Button>
          <Button icon={<ImportOutlined />} onClick={handleImportAccounts}>
            导入配置 (JSON)
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            添加邮箱配置
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={accounts}
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingAccount ? '编辑邮箱配置' : '添加邮箱配置'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={680}
        okText="保存配置"
        cancelText="取消"
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="快捷预设服务商"
          description={
            <Space wrap style={{ marginTop: 6 }}>
              <Button size="small" onClick={() => applyPreset('qq')}>QQ邮箱 (465/993)</Button>
              <Button size="small" onClick={() => applyPreset('163')}>163网易 (465/993)</Button>
              <Button size="small" onClick={() => applyPreset('tencent_ex')}>腾讯企业邮 (465/993)</Button>
              <Button size="small" onClick={() => applyPreset('aliyun')}>阿里企业邮 (465/993)</Button>
              <Button size="small" onClick={() => applyPreset('gmail')}>Gmail (587/993)</Button>
            </Space>
          }
        />

        {isGmail && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="Gmail 接入配置须知 (请仔细核对)"
            description={
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                <div>1. <strong>禁止直接输入 Google 普通账号密码</strong>：Google 早已强制要求第三方邮件客户端使用 <strong>16 位「应用专用密码」(App Password)</strong>；</div>
                <div>2. 请前往 <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>Google 账号应用专用密码生成页 ↗</a>（需提前开启两步验证），生成后将 16 位密码复制填入下方；</div>
                <div>3. 若需在收件箱中接收邮件，请确保在 <a href="https://mail.google.com/mail/u/0/#settings/fwdandpop" target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>Gmail 网页端设置 ↗</a> 中已勾选启用 IMAP 状态。</div>
              </div>
            }
          />
        )}

        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="邮箱别名 / 备注"
            rules={[{ required: true, message: '请输入别名' }]}
          >
            <Input placeholder="如：QQ营销邮箱-01、主客服账号" />
          </Form.Item>

          <Space style={{ display: 'flex' }} align="baseline">
            <Form.Item
              name="from_email"
              label="邮箱地址 (From Email)"
              rules={[{ required: true, message: '请输入邮箱' }, { type: 'email' }]}
              style={{ width: 300 }}
            >
              <Input placeholder="user@company.com" />
            </Form.Item>
            <Form.Item name="from_name" label="发件人昵称 (From Name)" style={{ width: 300 }}>
              <Input placeholder="如：支持团队" />
            </Form.Item>
          </Space>

          <Space style={{ display: 'flex' }} align="baseline">
            <Form.Item
              name="username"
              label="登录账号"
              rules={[{ required: true, message: '请输入账号' }]}
              style={{ width: 300 }}
            >
              <Input placeholder="通常为完整邮箱地址" />
            </Form.Item>
            <Form.Item
              name="password"
              label="授权码 / 密码"
              rules={[{ required: true, message: '请输入密码或授权码' }]}
              style={{ width: 300 }}
              extra={isGmail ? 'Gmail 必须使用 16 位 Google 应用专用密码' : 'QQ/163/Gmail 均需使用专用客户端授权码/应用密码'}
            >
              <Input.Password placeholder="授权码或密码" />
            </Form.Item>
          </Space>

          <Collapse
            defaultActiveKey={['smtp', 'imap']}
            style={{ marginBottom: 16 }}
            items={[
              {
                key: 'smtp',
                label: 'SMTP 发信服务器参数',
                children: (
                  <Space style={{ display: 'flex' }} align="baseline">
                    <Form.Item
                      name="host"
                      label="SMTP 地址"
                      rules={[{ required: true, message: '请输入 SMTP 地址' }]}
                      style={{ width: 300 }}
                    >
                      <Input placeholder="smtp.example.com" />
                    </Form.Item>
                    <Form.Item name="port" label="端口" rules={[{ required: true }]} style={{ width: 110 }}>
                      <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="use_ssl" label="SSL" valuePropName="checked">
                      <Switch checkedChildren="开" unCheckedChildren="关" />
                    </Form.Item>
                  </Space>
                ),
              },
              {
                key: 'imap',
                label: 'IMAP 收信服务器参数',
                children: (
                  <div>
                    <Form.Item name="enable_inbound" label="开启此账号收信功能" valuePropName="checked">
                      <Switch checkedChildren="已开启" unCheckedChildren="已关闭" />
                    </Form.Item>
                    <Space style={{ display: 'flex' }} align="baseline">
                      <Form.Item name="imap_host" label="IMAP 主机" style={{ width: 300 }}>
                        <Input placeholder="如: imap.qq.com" />
                      </Form.Item>
                      <Form.Item name="imap_port" label="端口" style={{ width: 110 }}>
                        <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="imap_use_ssl" label="SSL" valuePropName="checked">
                        <Switch checkedChildren="开" unCheckedChildren="关" />
                      </Form.Item>
                    </Space>
                    <p style={{ color: '#888', fontSize: 12, margin: 0 }}>
                      * 收信账号密码默认直接复用上面的登录账号与授权码。
                    </p>
                  </div>
                ),
              },
            ]}
          />

          <Space style={{ display: 'flex' }} align="baseline">
            <Form.Item
              name="daily_limit"
              label="单日最大发信量"
              extra="0 为不限制，超额后群发引擎自动切换其他发件箱"
              style={{ width: 300 }}
            >
              <InputNumber min={0} max={100000} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="status" label="账号状态" initialValue="active" style={{ width: 300 }}>
              <Switch
                checkedChildren="正常"
                unCheckedChildren="停用"
                defaultChecked
                onChange={(checked) =>
                  form.setFieldValue('status', checked ? 'active' : 'disabled')
                }
              />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal
        title={`连通性测试 - ${testingAccount?.name}`}
        open={testModalOpen}
        footer={[
          <Button key="cancel" onClick={() => setTestModalOpen(false)}>关闭</Button>,
          <Button
            key="imap"
            icon={<SyncOutlined />}
            loading={testingImap}
            onClick={handleTestImap}
          >
            测试 IMAP 收信
          </Button>,
          <Button
            key="smtp"
            type="primary"
            icon={<ThunderboltOutlined />}
            loading={testingSmtp}
            onClick={handleTestSmtp}
          >
            发送测试邮件 (SMTP)
          </Button>,
        ]}
        onCancel={() => setTestModalOpen(false)}
      >
        <p style={{ color: '#666' }}>
          发件箱：<strong>{testingAccount?.from_email}</strong> (
          SMTP: {testingAccount?.host}:{testingAccount?.port} / IMAP: {testingAccount?.imap_host || '自动'}
          )
        </p>
        <Form layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item label="接收测试邮件的目标邮箱" required>
            <Input
              placeholder="请输入能正常接收测试邮件的邮箱"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
