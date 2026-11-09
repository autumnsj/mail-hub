import React, { useState } from 'react';
import { Button, Space, Typography, Tag, message } from 'antd';
import {
  PaperClipOutlined,
  DeleteOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  FileZipOutlined,
  FileImageOutlined,
} from '@ant-design/icons';
import { MailAttachment } from '../types/electron';

const { Text } = Typography;

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return <FilePdfOutlined style={{ color: '#ff4d4f' }} />;
    case 'xls':
    case 'xlsx':
    case 'csv':
      return <FileExcelOutlined style={{ color: '#52c41a' }} />;
    case 'doc':
    case 'docx':
      return <FileWordOutlined style={{ color: '#1677ff' }} />;
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return <FileZipOutlined style={{ color: '#fa8c16' }} />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return <FileImageOutlined style={{ color: '#13c2c2' }} />;
    default:
      return <FileOutlined style={{ color: '#8c8c8c' }} />;
  }
}

interface AttachmentUploaderProps {
  attachments: MailAttachment[];
  onChange: (attachments: MailAttachment[]) => void;
  maxFiles?: number;
}

export const AttachmentUploader: React.FC<AttachmentUploaderProps> = ({
  attachments = [],
  onChange,
  maxFiles = 20,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleSelectFiles = async () => {
    try {
      const selected = await window.electronAPI.selectAttachments();
      if (!selected || selected.length === 0) return;

      const existingPaths = new Set(attachments.map((a) => a.path));
      const newItems = selected.filter((a) => !existingPaths.has(a.path));

      if (attachments.length + newItems.length > maxFiles) {
        message.warning(`最多可添加 ${maxFiles} 个附件`);
        return;
      }

      const merged = [...attachments, ...newItems];
      onChange(merged);
      if (newItems.length > 0) {
        message.success(`已添加 ${newItems.length} 个附件`);
      }
    } catch (e: any) {
      message.error(e.message || '选择附件失败');
    }
  };

  const handleRemove = (index: number) => {
    const updated = [...attachments];
    updated.splice(index, 1);
    onChange(updated);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const existingPaths = new Set(attachments.map((a) => a.path));
    const newItems: MailAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i] as any;
      // 在 Electron 渲染进程中，File 对象包含真实的本地绝对路径 path
      const filePath = f.path || f.name;
      if (!existingPaths.has(filePath)) {
        newItems.push({
          name: f.name,
          path: filePath,
          size: f.size,
        });
        existingPaths.add(filePath);
      }
    }

    if (attachments.length + newItems.length > maxFiles) {
      message.warning(`最多可添加 ${maxFiles} 个附件`);
      return;
    }

    onChange([...attachments, ...newItems]);
    if (newItems.length > 0) {
      message.success(`已拖入 ${newItems.length} 个附件`);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      style={{
        border: isDragging ? '1px dashed #1677ff' : '1px solid #d9d9d9',
        borderRadius: 8,
        padding: '12px 14px',
        background: isDragging ? '#f0f5ff' : '#fafafa',
        transition: 'all 0.2s',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: attachments.length > 0 ? 10 : 0,
        }}
      >
        <Space>
          <Button
            icon={<PaperClipOutlined />}
            onClick={handleSelectFiles}
            size="middle"
          >
            添加附件
          </Button>
          <Text type="secondary" style={{ fontSize: 12 }}>
            (支持任意文档、表格、压缩包、图片等，支持多选或直接拖拽文件到此)
          </Text>
        </Space>

        {attachments.length > 0 && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            已选 {attachments.length} 个附件 (总计{' '}
            {formatFileSize(attachments.reduce((acc, cur) => acc + (cur.size || 0), 0))})
          </Text>
        )}
      </div>

      {attachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
          {attachments.map((file, idx) => (
            <div
              key={file.path || idx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                background: '#fff',
                border: '1px solid #e8e8e8',
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              {getFileIcon(file.name)}
              <span
                style={{
                  maxWidth: 240,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={file.name}
              >
                {file.name}
              </span>
              <span style={{ color: '#8c8c8c', fontSize: 11 }}>
                ({formatFileSize(file.size)})
              </span>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined style={{ fontSize: 12 }} />}
                onClick={() => handleRemove(idx)}
                style={{ padding: 0, width: 20, height: 20, minWidth: 20 }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
