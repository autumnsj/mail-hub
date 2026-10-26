import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppLayout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { InboxPage } from './pages/InboxPage';
import { SentPage } from './pages/SentPage';
import { DraftsPage } from './pages/DraftsPage';
import { SingleSendPage } from './pages/SingleSendPage';
import { BatchSendPage } from './pages/BatchSendPage';
import { TasksPage } from './pages/TasksPage';
import { ContactsPage } from './pages/ContactsPage';
import { TemplatesPage } from './pages/TemplatesPage';

export const App: React.FC = () => {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
        },
      }}
    >
      <HashRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="sent" element={<SentPage />} />
            <Route path="drafts" element={<DraftsPage />} />
            <Route path="send/single" element={<SingleSendPage />} />
            <Route path="send/batch" element={<BatchSendPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="contacts" element={<ContactsPage />} />
            <Route path="templates" element={<TemplatesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ConfigProvider>
  );
};

export default App;
