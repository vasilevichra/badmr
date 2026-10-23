import TournamentService from './services/tournament.ts';

const tournamentService = new TournamentService();

/** id турнира из явного параметра запроса ?tournament=<id>.
 *
 *  Параметр принимается только если это число и турнир существует;
 *  иначе возвращается undefined — вызывающий использует глобальный
 *  current (старое поведение). Личный выбор турнира по ссылке
 *  /tournament/:id не меняет глобальный current. */
export default (req: { query: { tournament?: unknown } }): number | undefined => {
  const raw = req.query.tournament;
  if (raw === undefined) {
    return undefined;
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0 || !tournamentService.getById(id)) {
    return undefined;
  }
  return id;
};
