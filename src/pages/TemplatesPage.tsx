import React, { useEffect, useState } from 'react';
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Popconfirm,
  message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { RichEditor } from '../components/RichEditor';
import { Template } from '../types/electron';

export const TemplatesPage: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTpl, setPreviewTpl] = useState<Template | null>(null);
  const [editingTpl, setEditingTpl] = useState<Template | null>(null);
  const [content, setContent] = useState('');
  const [form] = Form.useForm();

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getTemplates();
      setTemplates(data || []);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const openCreateModal = () => {
    setEditingTpl(null);
    form.resetFields();
    setContent('<p>尊敬的 {name}：</p><p>这是邮件正文内容...</p>');
    setModalOpen(true);
  };

  const openEditModal = (tpl: Template) => {
    setEditingTpl(tpl);
    form.setFieldsValue(tpl);
    setContent(tpl.body_html);
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      await window.electronAPI.saveTemplate({
        ...values,
        id: editingTpl ? editingTpl.id : undefined,
        body_html: content,
      });
      message.success(editingTpl ? '更新模板成功' : '添加模板成功');
      setModalOpen(false);
      fetchTemplates();
    } catch (e: any) {
      if (e.message) message.error(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await window.electronAPI.deleteTemplate(id);
      message.success('模板已删除');
      fetchTemplates();
    } catch (e: any) {
      message.error(e.message);
    }
  };

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
          <h3 style={{ margin: 0 }}>邮件模板库</h3>
          <p style={{ margin: 0, color: '#888', fontSize: 13 }}>
            预设常用营销、通知、询盘邮件模板，单发或群发时一键载入调用。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          新建邮件模板
        </Button>
      </div>

      <Table
        rowKey="id"
        dataSource={templates}
        loading={loading}
        columns={[
          {
            title: '模板名称',
            dataIndex: 'title',
            render: (text) => <strong>{text}</strong>,
          },
          {
            title: '默认邮件主题',
            dataIndex: 'subject',
          },
          {
            title: '创建时间',
            dataIndex: 'created_at',
            width: 170,
            render: (t) => t?.slice(0, 10),
          },
          {
            title: '操作',
            width: 180,
            render: (_, r) => (
              <Space>
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => {
                    setPreviewTpl(r);
                    setPreviewOpen(true);
                  }}
                >
                  预览
                </Button>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(r)}>
                  编辑
                </Button>
                <Popconfirm
                  title="确认删除此模板？"
                  onConfirm={() => handleDelete(r.id)}
                  okText="删除"
                  cancelText="取消"
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editingTpl ? '编辑邮件模板' : '新建邮件模板'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        width={720}
        okText="保存模板"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="模板标识名称"
            rules={[{ required: true, message: '请输入模板标识' }]}
          >
            <Input placeholder="如：新客户欢迎信、账单催付提醒" />
          </Form.Item>
          <Form.Item
            name="subject"
            label="默认邮件主题"
            rules={[{ required: true, message: '请输入默认邮件主题' }]}
          >
            <Input placeholder="支持 {name}、{date} 等变量" />
          </Form.Item>
          <Form.Item label="正文富文本" required>
            <RichEditor value={content} onChange={setContent} height={280} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`模板预览: ${previewTpl?.title}`}
        open={previewOpen}
        footer={null}
        onCancel={() => setPreviewOpen(false)}
        width={650}
      >
        <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', marginBottom: 12 }}>
          <strong>主题：</strong> {previewTpl?.subject}
        </div>
        <div
          style={{
            padding: 16,
            background: '#fafafa',
            borderRadius: 6,
            minHeight: 180,
            border: '1px solid #e8e8e8',
          }}
          dangerouslySetInnerHTML={{ __html: previewTpl?.body_html || '' }}
        />
      </Modal>
    </div>
  );
};
