// Electron-обёртка: поднимает сервер (src/bin/start.ts) встроенным Node
// (ELECTRON_RUN_AS_NODE — TS выполняется штатным type-stripping, node ≥ 23.6)
// и открывает его в нативном окне.
//
// Пути:
//   BADMR_HOME — корень кода (в упакованном .app — Resources/app);
//   BADMR_DATA — корень данных (userData: ~/.Library/Application Support/Badmr):
//                .data/badmr.sqlite3, .data/sessions.db, .log/.
import { app, BrowserWindow, shell } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || '3000';
const URL = `http://localhost:${PORT}/`;
// корень кода: в dev — корень проекта, в упакованном .app — Resources/app
const HOME = app.isPackaged ? app.getAppPath() : process.cwd();
const DATA = app.getPath('userData');

const nodeEnv = { ...process.env, BADMR_HOME: HOME, BADMR_DATA: DATA };
// ELECTRON_RUN_AS_NODE — дочерние процессы исполняются как plain Node (TS, sqlite),
// а не как вторая копия Electron
const serverEnv = { ...nodeEnv, NODE_ENV: process.env.NODE_ENV || 'dev', ELECTRON_RUN_AS_NODE: '1' };

let server;
let win;

// GUI-процесс не пишет в stdout терминала — логируем в файл
const logFile = path.join(DATA, '.log', 'electron.log');
const log = (...a) => {
  try { fs.appendFileSync(logFile, `${new Date().toISOString()} ${a.join(' ')}\n`); } catch { /* нет .log ещё */ }
};
process.on('uncaughtException', (e) => log('uncaught:', e.stack));

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

/** Первый запуск: кладём сид-базу (если собрана) в userData. */
const seedData = () => {
  const seed = path.join(process.resourcesPath, 'seed', 'badmr.sqlite3');
  const db = path.join(DATA, '.data', 'badmr.sqlite3');
  if (app.isPackaged && fs.existsSync(seed) && !fs.existsSync(db)) {
    fs.copyFileSync(seed, db);
  }
};

/** Накат миграций отдельным процессом; resolve при успехе. */
const migrate = () => new Promise((resolve, reject) => {
  const m = spawn(process.execPath, ['src/bin/migrate.ts'], {
    cwd: HOME, env: serverEnv, stdio: 'inherit',
  });
  m.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`migrate exited ${code}`))));
});

const startServer = () => {
  server = spawn(process.execPath, ['src/bin/start.ts'], {
    cwd: HOME,
    env: serverEnv,
    stdio: 'inherit',
  });
  server.on('exit', (code) => {
    if (win && !win.isDestroyed()) {
      win.loadURL(`data:text/html,<h3 style="font-family:sans-serif">Сервер остановлен (код ${code}). Перезапустите приложение.</h3>`);
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
  // внешние ссылки — в системный браузер, не в окно
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(URL);
};

app.whenReady().then(async () => {
  fs.mkdirSync(path.join(DATA, '.data'), { recursive: true });
  fs.mkdirSync(path.join(DATA, '.log'), { recursive: true });
  log('start', { HOME, DATA, packaged: app.isPackaged });
  try {
    seedData();
    await migrate();
    log('migrations ok');
    startServer();
    await waitReady();
    log('server ready');
    await createWindow();
    log('window created');
  } catch (e) {
    log('startup failed:', e.stack);
  }
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
