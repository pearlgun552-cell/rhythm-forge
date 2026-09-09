const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('node:path');

let mainWindow = null;
let currentLanguage = 'zh';

function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about', label: '关于 Rhythm Forge' },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 Rhythm Forge' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出 Rhythm Forge' },
      ],
    }] : []),
    {
      label: '文件',
      submenu: [
        { label: '保存项目', accelerator: 'CmdOrCtrl+S', click: () => sendToRenderer('menu:save-project') },
        { label: '导出为 MP3', click: () => sendToRenderer('menu:export-mp3') },
        { type: 'separator' },
        isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        {
          label: '语言',
          submenu: [
            { label: '简体中文', type: 'radio', checked: currentLanguage === 'zh', click: () => setLanguage('zh') },
            { label: 'English', type: 'radio', checked: currentLanguage === 'en', click: () => setLanguage('en') },
          ],
        },
        { type: 'separator' },
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front', label: '全部置于顶层' }]
          : [{ role: 'close', label: '关闭' }]),
      ],
    },
    {
      label: '帮助',
      role: 'help',
      submenu: [
        { label: '关于 Rhythm Forge', click: () => showAbout() },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

function applyMenu() {
  Menu.setApplicationMenu(buildMenu());
}

function setLanguage(language) {
  if (language === currentLanguage) return;
  currentLanguage = language;
  sendToRenderer('menu:language', language);
  applyMenu();
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '关于 Rhythm Forge',
    message: 'Rhythm Forge',
    detail: `版本 ${app.getVersion()}\n面向音游曲创作的本地桌面音乐制作软件。`,
    buttons: ['确定'],
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0a0d14',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

ipcMain.on('app:language', (_event, language) => {
  if (language === 'zh' || language === 'en') {
    currentLanguage = language;
    applyMenu();
  }
});

app.whenReady().then(() => {
  createWindow();
  applyMenu();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
