import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {spawn, spawnSync} from "node:child_process";

const root = path.resolve(import.meta.dirname, "../..");
const stampPath = path.join(root, ".data/test.stamp");
const logPath = path.join(root, ".log/test.log");
const testDbPath = path.join(root, ".data/test.db");

// .data в .gitignore — в свежем checkout его нет, создаем до первого обращения
fs.mkdirSync(path.join(root, ".data"), {recursive: true});

/** БД-копии воркеров тестов (см. src/test-db.ts): воркер узнаваем по pid. */
const workerDbPaths = () =>
    fs.readdirSync(path.join(root, ".data"), {withFileTypes: true})
        .filter((e) => e.isFile() && /^test-\d+\.db$/.test(e.name))
        .map((e) => path.join(root, ".data", e.name));

/** Что влияет на результат тестов. Браузерные js/css исключены: они не тестируются. */
const sources = ["app.ts", "package.json", "src", "tests", "migrations"];

/** Каталоги, не влияющие на тесты. */
const excluded = new Set(["src/public/js", "src/public/css"]);

const hashSources = () => {
  const hash = crypto.createHash("sha256");
  const walk = (dir: string) => {
    if (excluded.has(path.relative(root, dir))) {
      return;
    }
    for (const entry of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        hash.update(path.relative(root, full));
        hash.update(fs.readFileSync(full));
      }
    }
  };
  for (const s of sources) {
    const full = path.join(root, s);
    if (fs.statSync(full).isDirectory()) {
      walk(full);
    } else {
      hash.update(s);
      hash.update(fs.readFileSync(full));
    }
  }
  return hash.digest("hex");
};

const current = hashSources();
const stamp = fs.existsSync(stampPath) ? fs.readFileSync(stampPath, "utf-8") : null;

if (stamp === current) {
  console.log("Тесты: файлы не менялись с прошлого успешного прогона — пропуск.");
  process.exit(0);
}

fs.rmSync(testDbPath, {force: true});
for (const p of workerDbPaths()) {
  fs.rmSync(p, {force: true});
}

const migrate = spawnSync("node", ["--experimental-strip-types", "src/bin/migrate.ts"], {
  cwd: root,
  stdio: "inherit",
  env: {...process.env, NODE_ENV: "test"},
});
if (migrate.status !== 0) {
  process.exit(migrate.status ?? 1);
}

// Нормализация тестового фикстура поверх миграций (migrations/fixture-for-tests.sql):
// дамп 05-specific перегенерируется из живой базы и уводит «текущий» турнир
// и справочники клубов/спортзалов от фиксированного тестового набора.
// clean() применяет тот же файл при каждом сбросе (tests/helpers/migration.ts).
const fixtureDb = new DatabaseSync(testDbPath);
fixtureDb.exec(fs.readFileSync(path.join(root, "migrations/fixture-for-tests.sql"), "utf-8"));
fixtureDb.close();

// Вывод тестов течёт в терминал сразу (иначе на весь прогон терминал молчит
// и запуск выглядит зависшим), параллельно дописываем его в лог.
await new Promise<void>((resolve) => {
  const test = spawn(
      "node",
      ["--experimental-strip-types", "--test",
        // ВСЕ опции — строго ДО пути: node --test трактует первый
        // позиционный аргумент как начало списка тестовых путей, и всё,
        // что после него, перестаёт быть опциями (force-exit молча
        // игнорируется — воркеры с живыми таймерами не завершаются)
        "--test-concurrency", String(Math.max(1, os.availableParallelism() - 1)),
        "--experimental-test-coverage",
        // node-schedule в тестах отложенных статусов турниров держит event loop
        // даже после срабатывания задач — завершаем процесс принудительно
        "--test-force-exit",
        // путь задаём явно: discovery от корня подбирает посторонние файлы
        // (например, src/test-db.ts — имя начинается с "test-")
        "tests"],
      {
        cwd: root,
        stdio: ["ignore", "pipe", "inherit"],
        env: {...process.env, NODE_ENV: "test"},
      }
  );
  fs.mkdirSync(path.dirname(logPath), {recursive: true});
  const log = fs.createWriteStream(logPath, {flags: "a"});
  test.stdout.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    log.write(chunk);
  });
  test.on("close", (code) => {
    log.end();
    if (code !== 0) {
      process.exit(code ?? 1);
    }
    resolve();
  });
});

// копии БД воркеров больше не нужны
for (const p of workerDbPaths()) {
  fs.rmSync(p, {force: true});
}

// штамп пишем только после успешного прогона
fs.mkdirSync(path.dirname(stampPath), {recursive: true});
fs.writeFileSync(stampPath, current);
console.log("Штамп тестов обновлён.");
