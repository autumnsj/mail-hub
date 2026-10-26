import React from 'react';
import { Layout as AntLayout, Menu, Typography, Badge, theme } from 'antd';
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
} from '@ant-design/icons';

const { Header, Sider, Content } = AntLayout;
const { Title, Text } = Typography;

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
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
          <Badge status="success" text={<Text type="secondary" style={{ fontSize: 12 }}>本地离线引擎就绪</Text>} />
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
    </AntLayout>
  );
};
