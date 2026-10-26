import { app, BrowserWindow, Menu } from 'electron';
import path from 'path';
import { registerIpcHandlers } from './ipc/handlers';
import { initAutoUpdater } from './services/updater';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Mail Hub - 邮箱管理器',
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#f5f7fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 初始化自动更新服务
  initAutoUpdater(mainWindow);

  // 生产环境隐藏默认顶层菜单栏（保持干净的桌面视感）
  if (process.platform === 'win32') {
    Menu.setApplicationMenu(null);
  }

  // 区分开发环境与打包环境
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 单实例锁 (防止多开冲突)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerIpcHandlers();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('before-quit', () => {
    // 退出前将所有 running 状态的任务安全转为 paused，防止下次打开死锁
    const { db } = require('./services/db');
    const data = db.getData();
    let hasRunning = false;
    data.campaigns.forEach((c: any) => {
      if (c.status === 'running') {
        c.status = 'paused';
        c.current_delay_info = '应用退出，已自动暂停';
        hasRunning = true;
      }
    });
    if (hasRunning) db.save();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
