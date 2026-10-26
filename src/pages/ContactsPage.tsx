import React, { useEffect, useState } from 'react';
import {
  Row,
  Col,
  Card,
  List,
  Table,
  Button,
  Input,
  Modal,
  Form,
  Space,
  Popconfirm,
  message,
} from 'antd';
import {
  PlusOutlined,
  ImportOutlined,
  DeleteOutlined,
  FolderOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { Contact, ContactGroup } from '../types/electron';

export const ContactsPage: React.FC = () => {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number>(0);
  const [searchKey, setSearchKey] = useState('');
  const [loading, setLoading] = useState(false);

  const [createContactOpen, setCreateContactOpen] = useState(false);
  const [batchImportOpen, setBatchImportOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  const [contactForm] = Form.useForm();
  const [groupForm] = Form.useForm();
  const [batchForm] = Form.useForm();

  const fetchGroups = async () => {
    try {
      const data = await window.electronAPI.getGroups();
      setGroups(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getContacts({
        groupId: selectedGroupId,
        keyword: searchKey,
      });
      setContacts(data || []);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [selectedGroupId, searchKey]);

  const handleCreateGroup = async () => {
    try {
      const values = await groupForm.validateFields();
      await window.electronAPI.saveGroup(values);
      message.success('创建群组成功');
      setCreateGroupOpen(false);
      groupForm.resetFields();
      fetchGroups();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleDeleteGroup = async (id: number) => {
    try {
      await window.electronAPI.deleteGroup(id);
      message.success('群组已删除');
      if (selectedGroupId === id) setSelectedGroupId(0);
      fetchGroups();
      fetchContacts();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleCreateContact = async () => {
    try {
      const values = await contactForm.validateFields();
      await window.electronAPI.saveContact({
        ...values,
        group_id: selectedGroupId || 0,
      });
      message.success('添加联系人成功');
      setCreateContactOpen(false);
      contactForm.resetFields();
      fetchContacts();
      fetchGroups();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleBatchImport = async () => {
    try {
      const values = await batchForm.validateFields();
      const count = await window.electronAPI.batchImportContacts(
        selectedGroupId || 0,
        values.content
      );
      message.success(`成功导入 ${count} 个新联系人！`);
      setBatchImportOpen(false);
      batchForm.resetFields();
      fetchContacts();
      fetchGroups();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleDeleteContact = async (id: number) => {
    try {
      await window.electronAPI.deleteContact(id);
      message.success('删除成功');
      fetchContacts();
      fetchGroups();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const handleClearContacts = async () => {
    try {
      await window.electronAPI.clearContacts(selectedGroupId);
      message.success('已清空');
      fetchContacts();
      fetchGroups();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  return (
    <div>
      <Row gutter={16}>
        <Col xs={24} md={6}>
          <Card
            title="联系人群组"
            extra={
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => setCreateGroupOpen(true)}
              >
                新建
              </Button>
            }
          >
            <List
              size="small"
              dataSource={[{ id: 0, name: '全部联系人', description: '', created_at: '' }, ...groups]}
              renderItem={(g) => (
                <List.Item
                  onClick={() => setSelectedGroupId(g.id)}
                  style={{
                    cursor: 'pointer',
                    background: selectedGroupId === g.id ? '#e6f4ff' : 'transparent',
                    borderRadius: 6,
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <Space>
                    <FolderOutlined />
                    <span>{g.name}</span>
                  </Space>
                  {g.id !== 0 && (
                    <Popconfirm
                      title="删除此分组？(组内联系人保留)"
                      onConfirm={(e) => {
                        e?.stopPropagation();
                        handleDeleteGroup(g.id);
                      }}
                      okText="删除"
                      cancelText="取消"
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>
                  )}
                </List.Item>
              )}
            />
          </Card>
        </Col>

        <Col xs={24} md={18}>
          <Card
            title={
              <Space>
                <span>
                  {selectedGroupId === 0
                    ? '全部联系人'
                    : groups.find((g) => g.id === selectedGroupId)?.name}
                </span>
                <Input.Search
                  placeholder="搜索邮箱或姓名"
                  onSearch={(v) => setSearchKey(v)}
                  allowClear
                  style={{ width: 200 }}
                />
              </Space>
            }
            extra={
              <Space>
                <Button icon={<ImportOutlined />} onClick={() => setBatchImportOpen(true)}>
                  批量粘贴导入
                </Button>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setCreateContactOpen(true)}
                >
                  添加联系人
                </Button>
                <Popconfirm
                  title="确认清空当前列表所有联系人？"
                  onConfirm={handleClearContacts}
                  okText="确定清空"
                  cancelText="取消"
                >
                  <Button danger icon={<ClearOutlined />} />
                </Popconfirm>
              </Space>
            }
          >
            <Table
              rowKey="id"
              dataSource={contacts}
              loading={loading}
              pagination={{ pageSize: 10 }}
              columns={[
                {
                  title: '邮箱地址',
                  dataIndex: 'email',
                  render: (email) => <strong>{email}</strong>,
                },
                {
                  title: '收件人称谓',
                  dataIndex: 'name',
                  render: (name) => name || '-',
                },
                {
                  title: '公司 / 备注',
                  dataIndex: 'company',
                  render: (c) => c || '-',
                },
                {
                  title: '操作',
                  width: 80,
                  render: (_, r) => (
                    <Popconfirm
                      title="确定删除此联系人？"
                      onConfirm={() => handleDeleteContact(r.id)}
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title="新建联系人群组"
        open={createGroupOpen}
        onOk={handleCreateGroup}
        onCancel={() => setCreateGroupOpen(false)}
        okText="创建"
        cancelText="取消"
      >
        <Form form={groupForm} layout="vertical">
          <Form.Item
            name="name"
            label="群组名称"
            rules={[{ required: true, message: '请输入群组名称' }]}
          >
            <Input placeholder="如：2026核心客户、外贸询盘列表" />
          </Form.Item>
          <Form.Item name="description" label="备注说明 (选填)">
            <Input.TextArea placeholder="简要说明" rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="添加单个联系人"
        open={createContactOpen}
        onOk={handleCreateContact}
        onCancel={() => setCreateContactOpen(false)}
        okText="添加"
        cancelText="取消"
      >
        <Form form={contactForm} layout="vertical">
          <Form.Item
            name="email"
            label="邮箱地址"
            rules={[{ required: true, message: '请输入有效邮箱' }, { type: 'email' }]}
          >
            <Input placeholder="user@company.com" />
          </Form.Item>
          <Form.Item name="name" label="姓名 / 尊称">
            <Input placeholder="如：张经理" />
          </Form.Item>
          <Form.Item name="company" label="公司名称 / 备注">
            <Input placeholder="如：腾讯科技" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="批量粘贴导入联系人"
        open={batchImportOpen}
        onOk={handleBatchImport}
        onCancel={() => setBatchImportOpen(false)}
        okText="开始导入"
        cancelText="取消"
        width={580}
      >
        <p style={{ color: '#666', fontSize: 13 }}>
          支持直接粘贴文本，一行一条。自动识别提取邮箱与姓名，自动去重。
        </p>
        <Form form={batchForm} layout="vertical">
          <Form.Item
            name="content"
            label="粘贴文本内容"
            rules={[{ required: true, message: '请粘贴内容' }]}
            extra="支持格式示例：&#10;zhangsan@domain.com&#10;李四,lisi@domain.com&#10;王经理 <wangwu@company.cn>"
          >
            <Input.TextArea rows={8} placeholder="直接粘贴文本..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
