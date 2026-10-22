import fs from "node:fs";

/** Эталонная тестовая БД: её накатывает src/bin/migrate.ts (NODE_ENV=test),
 *  её же удаляет и пересоздаёт раннер тестов перед прогоном. */
export const masterTestDbPath = "./.data/test.db";

/** Путь тестовой БД для текущего процесса.
 *
 *  Файлы тестов исполняются воркерами node:test параллельно, каждый в своём
 *  процессе. Общая БД сделала бы воркеры зависимыми друг от друга (clean()
 *  одной сюиты стирал бы данные другой), поэтому каждому процессу выдаётся
 *  своя копия эталонной БД — изолированная и одноразовая. Раннер тестов
 *  подчищает копии в начале следующего прогона. */
export const testDbPath = (): string => {
  const p = `./.data/test-${process.pid}.db`;
  if (!fs.existsSync(p) && fs.existsSync(masterTestDbPath)) {
    fs.copyFileSync(masterTestDbPath, p);
  }
  return p;
};
