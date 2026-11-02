// Electron-обёртка: поднимает сервер (src/bin/start.ts) системным node
// и открывает его в нативном окне. Сервер живёт в дочернем процессе и
// гасится при закрытии окна / выходе из приложения.
import { app, BrowserWindow, shell } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';

const PORT = process.env.PORT || '3000';
const URL = `http://localhost:${PORT}/`;
// npm run всегда исполняется из корня проекта
const ROOT = process.cwd();

let server;
let win;

/** Ждёт, пока сервер начнёт отвечать (до 30 с). */
const waitReady = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(URL);
      if (res.status < 500) return;
    } catch { /* ещё не поднялся */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not start at ${URL}`);
};

const startServer = () => {
  // системный node: внутри Electron свой Node без --experimental-strip-types
  server = spawn('node', ['--experimental-strip-types', 'src/bin/start.ts'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'dev' },
    stdio: 'inherit',
  });
  server.on('exit', (code) => {
    if (win && !win.isDestroyed()) {
      win.loadURL(`data:text/html,<h3 style="font-family:sans-serif">Сервер остановлен (код ${code}). Перезапустите npm run dev.</h3>`);
    }
  });
  return server;
};

const createWindow = async () => {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Бадминтон и ром',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // внешние ссылки (если появятся) — в системный браузер, не в окно
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(URL);
};

app.whenReady().then(async () => {
  startServer();
  await waitReady();
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

const stopServer = () => {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    server = undefined;
  }
};

app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});
app.on('before-quit', stopServer);
