import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Button, Space, Tooltip, Input, Modal, Dropdown } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  StrikethroughOutlined,
  UnorderedListOutlined,
  OrderedListOutlined,
  LinkOutlined,
  PictureOutlined,
  ClearOutlined,
  CodeOutlined,
  TagOutlined,
} from '@ant-design/icons';

interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  height?: number | string;
}

export const RichEditor: React.FC<RichEditorProps> = ({
  value,
  onChange,
  placeholder = '在此自由编辑邮件正文内容...',
  height = 300,
}) => {
  const [showHtmlModal, setShowHtmlModal] = useState(false);
  const [htmlCode, setHtmlCode] = useState(value);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
      }),
      Image,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) {
    return null;
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('请输入超链接 URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const addImage = () => {
    const url = window.prompt('请输入图片在线 URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const insertVariable = (variable: string) => {
    editor.chain().focus().insertContent(`{${variable}}`).run();
  };

  const variableMenuItems = [
    { key: 'name', label: '{name} - 收件人姓名/称谓', onClick: () => insertVariable('name') },
    { key: 'email', label: '{email} - 收件人邮箱', onClick: () => insertVariable('email') },
    { key: 'date', label: '{date} - 当前日期 (YYYY-MM-DD)', onClick: () => insertVariable('date') },
    { key: 'datetime', label: '{datetime} - 当前详细时间', onClick: () => insertVariable('datetime') },
  ];

  return (
    <div
      style={{
        border: '1px solid #d9d9d9',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      {/* 顶部工具栏 */}
      <div
        style={{
          padding: '6px 10px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fafafa',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
        }}
      >
        <Space direction="horizontal" size={4} wrap>
          <Tooltip title="加粗">
            <Button
              size="small"
              type={editor.isActive('bold') ? 'primary' : 'text'}
              icon={<BoldOutlined />}
              onClick={() => editor.chain().focus().toggleBold().run()}
            />
          </Tooltip>
          <Tooltip title="斜体">
            <Button
              size="small"
              type={editor.isActive('italic') ? 'primary' : 'text'}
              icon={<ItalicOutlined />}
              onClick={() => editor.chain().focus().toggleItalic().run()}
            />
          </Tooltip>
          <Tooltip title="删除线">
            <Button
              size="small"
              type={editor.isActive('strike') ? 'primary' : 'text'}
              icon={<StrikethroughOutlined />}
              onClick={() => editor.chain().focus().toggleStrike().run()}
            />
          </Tooltip>

          <span style={{ borderLeft: '1px solid #e8e8e8', margin: '0 4px', height: 16 }} />

          <Tooltip title="标题 1">
            <Button
              size="small"
              type={editor.isActive('heading', { level: 1 }) ? 'primary' : 'text'}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              H1
            </Button>
          </Tooltip>
          <Tooltip title="标题 2">
            <Button
              size="small"
              type={editor.isActive('heading', { level: 2 }) ? 'primary' : 'text'}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              H2
            </Button>
          </Tooltip>

          <span style={{ borderLeft: '1px solid #e8e8e8', margin: '0 4px', height: 16 }} />

          <Tooltip title="无序列表">
            <Button
              size="small"
              type={editor.isActive('bulletList') ? 'primary' : 'text'}
              icon={<UnorderedListOutlined />}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
            />
          </Tooltip>
          <Tooltip title="有序列表">
            <Button
              size="small"
              type={editor.isActive('orderedList') ? 'primary' : 'text'}
              icon={<OrderedListOutlined />}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
            />
          </Tooltip>

          <span style={{ borderLeft: '1px solid #e8e8e8', margin: '0 4px', height: 16 }} />

          <Tooltip title="插入链接">
            <Button
              size="small"
              type={editor.isActive('link') ? 'primary' : 'text'}
              icon={<LinkOutlined />}
              onClick={setLink}
            />
          </Tooltip>
          <Tooltip title="插入网络图片">
            <Button size="small" type="text" icon={<PictureOutlined />} onClick={addImage} />
          </Tooltip>

          <span style={{ borderLeft: '1px solid #e8e8e8', margin: '0 4px', height: 16 }} />

          <Dropdown menu={{ items: variableMenuItems }} placement="bottomLeft">
            <Button size="small" type="dashed" icon={<TagOutlined />}>
              插入动态变量
            </Button>
          </Dropdown>

          <Tooltip title="HTML 源码">
            <Button
              size="small"
              type="text"
              icon={<CodeOutlined />}
              onClick={() => {
                setHtmlCode(editor.getHTML());
                setShowHtmlModal(true);
              }}
            >
              HTML
            </Button>
          </Tooltip>

          <Tooltip title="清空内容">
            <Button
              size="small"
              type="text"
              danger
              icon={<ClearOutlined />}
              onClick={() => editor.chain().focus().clearContent().run()}
            />
          </Tooltip>
        </Space>
      </div>

      {/* 编辑区 */}
      <div
        style={{
          minHeight: height,
          maxHeight: 500,
          overflowY: 'auto',
          padding: '12px 14px',
          outline: 'none',
          fontSize: 14,
        }}
        onClick={() => editor.chain().focus()}
      >
        <EditorContent editor={editor} />
      </div>

      {/* HTML 源码编辑模态框 */}
      <Modal
        title="编辑 HTML 源码"
        open={showHtmlModal}
        onOk={() => {
          editor.commands.setContent(htmlCode);
          onChange(htmlCode);
          setShowHtmlModal(false);
        }}
        onCancel={() => setShowHtmlModal(false)}
        width={680}
        okText="应用"
        cancelText="取消"
      >
        <Input.TextArea
          rows={14}
          value={htmlCode}
          onChange={(e) => setHtmlCode(e.target.value)}
          placeholder="在此修改或粘贴 HTML"
          style={{ fontFamily: 'monospace' }}
        />
      </Modal>
    </div>
  );
};
