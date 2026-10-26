import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import https from 'https';

export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
  downloadUrl?: string;
}

export interface UpdateStatusPayload {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  updateInfo?: UpdateInfo;
  progress?: {
    percent: number;
    transferred: number;
    total: number;
    bytesPerSecond: number;
  };
  error?: string;
}

let mainWindow: BrowserWindow | null = null;
let currentStatus: UpdateStatusPayload = {
  status: 'idle',
  currentVersion: app.getVersion() || '1.0.0',
};

function sendStatusToWindow(status: Partial<UpdateStatusPayload>) {
  currentStatus = { ...currentStatus, ...status };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status-changed', currentStatus);
  }
}

// 检查 GitHub Releases 最新版本 (通用 HTTP 模式，在开发环境与生产环境均可工作)
function checkGitHubRelease(): Promise<UpdateInfo | null> {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/autumnsj/mail-hub/releases/latest',
      headers: {
        'User-Agent': 'MailHub-Desktop-Updater',
      },
    };

    https
      .get(options, (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const data = JSON.parse(rawData);
              const tagName = data.tag_name || '';
              const latestVer = tagName.replace(/^v/, '');
              resolve({
                version: latestVer,
                releaseDate: data.published_at,
                releaseNotes: data.body,
                downloadUrl: data.html_url,
              });
            } else {
              resolve(null);
            }
          } catch {
            resolve(null);
          }
        });
      })
      .on('error', () => {
        resolve(null);
      });
  });
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export function initAutoUpdater(win: BrowserWindow) {
  mainWindow = win;
  currentStatus.currentVersion = app.getVersion();

  // 配置 electron-updater
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendStatusToWindow({ status: 'checking', error: undefined });
  });

  autoUpdater.on('update-available', (info) => {
    sendStatusToWindow({
      status: 'available',
      updateInfo: {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      },
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendStatusToWindow({ status: 'not-available' });
  });

  autoUpdater.on('error', (err) => {
    sendStatusToWindow({
      status: 'error',
      error: err.message || '检查更新失败',
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendStatusToWindow({
      status: 'downloading',
      progress: {
        percent: Math.round(progressObj.percent),
        transferred: progressObj.transferred,
        total: progressObj.total,
        bytesPerSecond: progressObj.bytesPerSecond,
      },
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatusToWindow({
      status: 'downloaded',
      updateInfo: {
        version: info.version,
      },
    });
  });

  // 注册 IPC 处理句柄
  ipcMain.handle('updater:get-status', () => {
    return currentStatus;
  });

  ipcMain.handle('updater:check', async () => {
    sendStatusToWindow({ status: 'checking', error: undefined });

    if (app.isPackaged) {
      try {
        await autoUpdater.checkForUpdates();
        return currentStatus;
      } catch (err: any) {
        console.warn('autoUpdater 失败，回退到 GitHub Releases 检查:', err.message);
      }
    }

    // 开发环境或 autoUpdater 异常时使用 GitHub Releases 检查
    const release = await checkGitHubRelease();
    if (release && compareVersions(release.version, currentStatus.currentVersion) > 0) {
      sendStatusToWindow({
        status: 'available',
        updateInfo: release,
      });
    } else {
      sendStatusToWindow({
        status: 'not-available',
      });
    }

    return currentStatus;
  });

  ipcMain.handle('updater:download', async () => {
    if (app.isPackaged) {
      sendStatusToWindow({ status: 'downloading' });
      await autoUpdater.downloadUpdate();
    } else {
      // 开发环境直接通知已下载
      sendStatusToWindow({ status: 'downloaded' });
    }
    return true;
  });

  ipcMain.handle('updater:install', () => {
    if (app.isPackaged) {
      autoUpdater.quitAndInstall();
    } else {
      app.relaunch();
      app.exit(0);
    }
  });
}
