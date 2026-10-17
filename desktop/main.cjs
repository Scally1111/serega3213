'use strict';

const { app, BrowserWindow, dialog, shell } = require('electron');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');

let mainWindow = null;
let localPort = null;
let isQuitting = false;
// After creating the Render service, update this URL if Render assigned a different hostname.
const PUBLIC_GAME_SERVER = process.env.SEREGA_PUBLIC_SERVER || 'https://serega-v3.onrender.com';

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 12000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/', timeout: 1200 }, res => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) resolve();
        else retry();
      });
      req.on('error', retry);
      req.on('timeout', () => req.destroy(new Error('Local server timeout')));
      function retry() {
        req.destroy();
        if (Date.now() - started > timeoutMs) reject(new Error('Локальный игровой сервер не запустился за отведённое время.'));
        else setTimeout(attempt, 180);
      }
    };
    attempt();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#070b12',
    autoHideMenuBar: true,
    title: 'Serega V3',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${localPort}/`)) event.preventDefault();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(`http://127.0.0.1:${localPort}/?server=${encodeURIComponent(PUBLIC_GAME_SERVER)}`);
}

app.whenReady().then(async () => {
  try {
    localPort = await findFreePort();
    process.env.PORT = String(localPort);
    process.env.HOST = '127.0.0.1';
    // Start the existing HTTP/WebSocket game server inside the Electron main process.
    require(path.join(app.getAppPath(), 'server.js'));
    await waitForServer(localPort);
    createWindow();
  } catch (error) {
    console.error(error);
    await dialog.showMessageBox({
      type: 'error',
      title: 'Serega V3 — ошибка запуска',
      message: 'Не удалось запустить игровой сервер.',
      detail: `${error.message}\n\nПопробуй перезапустить игру. Если ошибка повторяется, отправь этот текст разработчику.`,
      buttons: ['Закрыть']
    });
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && localPort) createWindow();
});
app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
