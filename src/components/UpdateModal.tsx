import React, { useEffect, useState } from 'react';
import { Modal, Button, Progress, Alert, Typography, Space, Badge } from 'antd';
import {
  CloudSyncOutlined,
  CheckCircleOutlined,
  ArrowUpOutlined,
  SyncOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { UpdateStatusPayload } from '../types/electron';

const { Text, Paragraph } = Typography;

interface UpdateModalProps {
  open: boolean;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ open, onClose }) => {
  const [statusPayload, setStatusPayload] = useState<UpdateStatusPayload>({
    status: 'idle',
    currentVersion: '1.0.0',
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    window.electronAPI.getUpdateStatus().then((s) => {
      if (s) setStatusPayload(s);
    });

    const unsubscribe = window.electronAPI.onUpdateStatusChanged((newStatus) => {
      setStatusPayload(newStatus);
      if (newStatus.status !== 'checking') {
        setLoading(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleCheck = async () => {
    setLoading(true);
    try {
      const res = await window.electronAPI.checkForUpdates();
      if (res) setStatusPayload(res);
    } catch {
      // status will be updated via event or returned payload
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      await window.electronAPI.downloadUpdate();
    } catch (e) {
      console.error(e);
    }
  };

  const handleInstall = () => {
    window.electronAPI.installUpdate();
  };

  const { status, currentVersion, updateInfo, progress, error } = statusPayload;

  return (
    <Modal
      title={
        <Space>
          <CloudSyncOutlined style={{ color: '#1677ff' }} />
          <span>软件更新检查</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={[
        status === 'downloaded' ? (
          <Button key="install" type="primary" icon={<ArrowUpOutlined />} onClick={handleInstall}>
            立即重启并安装更新
          </Button>
        ) : status === 'downloading' ? (
          <Button key="downloading" type="primary" loading>
            正在下载更新包...
          </Button>
        ) : status === 'available' ? (
          <Button
            key="download"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownload}
          >
            下载更新包
          </Button>
        ) : (
          <Button
            key="check"
            type="primary"
            icon={<SyncOutlined spin={loading || status === 'checking'} />}
            loading={loading || status === 'checking'}
            onClick={handleCheck}
          >
            检查更新
          </Button>
        ),
        <Button key="close" onClick={onClose}>
          关闭
        </Button>,
      ]}
      width={560}
    >
      <div style={{ padding: '12px 0' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#fafafa',
            padding: '12px 16px',
            borderRadius: 8,
            marginBottom: 16,
            border: '1px solid #f0f0f0',
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: '#8c8c8c' }}>当前安装版本</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>v{currentVersion}</div>
          </div>
          <Badge
            status={status === 'available' ? 'warning' : 'success'}
            text={
              <Text strong style={{ fontSize: 13 }}>
                {status === 'available'
                  ? `发现新版本 v${updateInfo?.version}`
                  : '已配置 GitHub 自动更新源'}
              </Text>
            }
          />
        </div>

        {/* 状态展示 */}
        {status === 'checking' && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <SyncOutlined spin style={{ fontSize: 28, color: '#1677ff', marginBottom: 12 }} />
            <div>正在检查 GitHub Releases 最新版本...</div>
          </div>
        )}

        {status === 'not-available' && (
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            message="当前已是最新版本"
            description={`您当前使用的 v${currentVersion} 已经是最新版本，无需更新。`}
          />
        )}

        {status === 'available' && updateInfo && (
          <div>
            <Alert
              type="info"
              showIcon
              message={`发现全新版本 v${updateInfo.version}！`}
              description={
                <div>
                  {updateInfo.releaseDate && (
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>
                      发布时间：{updateInfo.releaseDate.slice(0, 10)}
                    </div>
                  )}
                  {updateInfo.releaseNotes ? (
                    <div>
                      <div style={{ fontWeight: 600, marginTop: 4, marginBottom: 2 }}>更新日志：</div>
                      <Paragraph
                        style={{
                          background: '#fff',
                          padding: 8,
                          borderRadius: 4,
                          fontSize: 12,
                          maxHeight: 180,
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          border: '1px solid #e8e8e8',
                        }}
                      >
                        {updateInfo.releaseNotes}
                      </Paragraph>
                    </div>
                  ) : (
                    <div>包含了功能升级与稳定性优化，推荐立即更新。</div>
                  )}
                </div>
              }
              style={{ marginBottom: 14 }}
            />
          </div>
        )}

        {status === 'downloading' && (
          <div style={{ padding: '12px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span>正在下载更新包...</span>
              <span>{progress?.percent || 0}%</span>
            </div>
            <Progress percent={progress?.percent || 0} status="active" strokeColor="#1677ff" />
            {progress && progress.total > 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: '#8c8c8c',
                  marginTop: 6,
                }}
              >
                <span>
                  {(progress.transferred / 1024 / 1024).toFixed(1)}MB /{' '}
                  {(progress.total / 1024 / 1024).toFixed(1)}MB
                </span>
                <span>{(progress.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s</span>
              </div>
            )}
          </div>
        )}

        {status === 'downloaded' && (
          <Alert
            type="success"
            showIcon
            message="新版本更新包已下载完成！"
            description="点击下方按钮即可重启 Mail Hub 并自动完成版本替换升级。"
          />
        )}

        {status === 'error' && (
          <Alert
            type="error"
            showIcon
            message="检查或下载更新失败"
            description={
              <div>
                <div>{error || '网络连接异常，无法连接到 GitHub Releases 服务'}</div>
                {updateInfo?.downloadUrl && (
                  <div style={{ marginTop: 8 }}>
                    您也可以直接前往官网或 Releases 页面手动下载安装：
                    <a href={updateInfo.downloadUrl} target="_blank" rel="noreferrer">
                      打开 GitHub 发布页 ↗
                    </a>
                  </div>
                )}
              </div>
            }
          />
        )}
      </div>
    </Modal>
  );
};
