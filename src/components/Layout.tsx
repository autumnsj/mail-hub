import React, { useState, useEffect } from 'react';
import { Layout as AntLayout, Menu, Typography, Badge, theme, Button, Space } from 'antd';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  DashboardOutlined,
  MailOutlined,
  SendOutlined,
  ClusterOutlined,
  HistoryOutlined,
  TeamOutlined,
  FileTextOutlined,
  InboxOutlined,
  EditOutlined,
  FormOutlined,
  CloudSyncOutlined,
} from '@ant-design/icons';
import { UpdateModal } from './UpdateModal';

const { Header, Sider, Content } = AntLayout;
const { Title, Text } = Typography;

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState('1.0.0');

  useEffect(() => {
    window.electronAPI.getUpdateStatus().then((s) => {
      if (s) {
        setAppVersion(s.currentVersion);
        if (s.status === 'available' || s.status === 'downloaded') {
          setHasUpdate(true);
        }
      }
    });

    const unsubscribe = window.electronAPI.onUpdateStatusChanged((status) => {
      if (status.status === 'available' || status.status === 'downloaded') {
        setHasUpdate(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '工作台概览',
    },
    {
      key: '/accounts',
      icon: <MailOutlined />,
      label: '发件箱配置 (SMTP)',
    },
    {
      key: '/inbox',
      icon: <InboxOutlined />,
      label: '收件箱 (收取与回复)',
    },
    {
      key: '/sent',
      icon: <SendOutlined />,
      label: '发件箱 (已发送邮件)',
    },
    {
      key: '/drafts',
      icon: <FormOutlined />,
      label: '草稿箱 (邮件草稿)',
    },
    {
      key: '/send/single',
      icon: <EditOutlined />,
      label: '单封即时发送',
    },
    {
      key: '/send/batch',
      icon: <ClusterOutlined />,
      label: '多邮箱分摊群发',
    },
    {
      key: '/tasks',
      icon: <HistoryOutlined />,
      label: '任务调度与明细',
    },
    {
      key: '/contacts',
      icon: <TeamOutlined />,
      label: '联系人与分组',
    },
    {
      key: '/templates',
      icon: <FileTextOutlined />,
      label: '邮件模板库',
    },
  ];

  return (
    <AntLayout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider width={220} theme="dark">
        <div
          style={{
            height: 60,
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            background: 'rgba(255, 255, 255, 0.05)',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#1677ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 18,
            }}
          >
            ✉
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Mail Hub</div>
            <div style={{ color: '#8c8c8c', fontSize: 11 }}>纯本地桌面客户端</div>
          </div>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ marginTop: 8 }}
        />
      </Sider>

      <AntLayout style={{ height: '100%', overflow: 'hidden' }}>
        <Header
          style={{
            padding: '0 20px',
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
            height: 54,
          }}
        >
          <Title level={4} style={{ margin: 0, fontWeight: 500, fontSize: 16 }}>
            {menuItems.find((item) => item.key === location.pathname)?.label || '工作台'}
          </Title>
          <Space size="middle" align="center">
            <Button
              type="text"
              size="small"
              icon={<CloudSyncOutlined style={{ color: hasUpdate ? '#fa8c16' : '#1677ff' }} />}
              onClick={() => setUpdateModalOpen(true)}
              style={{ fontSize: 12, padding: '0 8px', height: 28 }}
            >
              <Badge dot={hasUpdate} offset={[4, 0]}>
                <span>{hasUpdate ? '发现新版本' : `检查更新 (v${appVersion})`}</span>
              </Badge>
            </Button>
            <Badge status="success" text={<Text type="secondary" style={{ fontSize: 12 }}>本地离线引擎就绪</Text>} />
          </Space>
        </Header>

        <Content
          style={{
            padding: 20,
            overflowY: 'auto',
            height: 'calc(100vh - 54px)',
            background: '#f5f7fa',
          }}
        >
          <div
            style={{
              padding: 24,
              minHeight: '100%',
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <Outlet />
          </div>
        </Content>
      </AntLayout>
      <UpdateModal open={updateModalOpen} onClose={() => setUpdateModalOpen(false)} />
    </AntLayout>
  );
};
