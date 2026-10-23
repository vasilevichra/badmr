import createError from 'http-errors';
import TournamentService from '../services/tournament.ts';

const tournamentService = new TournamentService();

/** Defense-in-depth для мутаций: write-запрос с явным ?tournament=,
 *  указывающим не на глобальный current, отклоняется с 409. Запись игр,
 *  регистрация и другие мутации всегда выполняются над глобальным
 *  текущим турниром; просмотр чужого турнира по ссылке — read-only.
 *  GET-запросы и запросы без параметра проходят как раньше. */
export default (req: { method: string; query: { tournament?: unknown } }, _res: unknown, next: (err?: unknown) => void) => {
  if (req.method === 'GET' || req.query.tournament === undefined) {
    return next();
  }
  const current = (tournamentService.getCurrent() as { id: number } | undefined)?.id;
  const requested = Number(req.query.tournament);
  if (Number.isInteger(requested) && requested !== current) {
    return next(createError(409, 'Запись возможна только в текущий турнир'));
  }
  next();
};
