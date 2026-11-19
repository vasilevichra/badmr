import GroupRepository from '../repositories/group.ts';
import Repository from '../repositories/common.ts';

export interface HistTeam {
  name: string;
  city: string;
}

export interface HistMatch {
  id: number;
  team_1_id: number;
  team_2_id: number;
  team_1: HistTeam;
  team_2: HistTeam;
  score_1: number;
  score_2: number;
  finished: 0 | 1;
  // по счёту последней игры (110 очков — победа); незавершённый или ничья — null
  winner_id: number | null;
  // итоговое место команды в котле, если этот матч — последний для неё
  // в котле и завершён; иначе null (только олимпийский режим)
  place_1: number | null;
  place_2: number | null;
}

export interface HistPocket {
  name: string;
  // котёл привязан к группе: сетка котла рендерится под составами её команд
  group_id: number;
  // «две жизни»: проигравший продолжает играть в основных кругах. Иначе
  // олимпийская система: rounds — дерево победителей, consRounds — доигровки
  // (матч двух уже проигравших выдаёт систему с consolation — в котле
  // с двумя жизнями дважды проигравшие не играют)
  twoLives: boolean;
  // rounds[r-1] — матчи круга r в порядке создания; круг матча = max кругов
  // предыдущих матчей его команд + 1 («две жизни» ложатся в колонки сами)
  rounds: HistMatch[][];
  consRounds: HistMatch[][];
  // команды, впервые играющие в дереве после 1-го круга (бай в 1-м круге —
  // плашка без соперника); только для олимпийского режима, у «двух жизней»
  // поздний старт — норма (проигравший сидит круг), бай не рисуем
  mainByes: HistTeam[];
  consByes: HistTeam[];
}

interface HistRow {
  id: number;
  team_1_id: number;
  team_2_id: number;
  score_1: number;
  score_2: number;
  finished: 0 | 1;
  group_1_id: number;
  name_1: string;
  city_1: string;
  name_2: string;
  city_2: string;
  // зафиксированная организатором структура (pocket_structure): main/round,
  // либо NULL — круг назначит реконструкция
  struct_main: number | null;
  struct_round: number | null;
}

class BracketHistory {
  declare static _instance: BracketHistory | undefined;
  group!: GroupRepository;
  db!: Repository['db'];

  constructor() {
    if (BracketHistory._instance) {
      return BracketHistory._instance;
    }
    BracketHistory._instance = this;

    this.group = new GroupRepository();
    this.db = new Repository().db;
  }

  /** Реконструкция сыгранной сетки архивного турнира 110 без слотов.
   *  Если структура котла зафиксирована в pocket_structure (все матчи
   *  размечены), круги и доигровки берутся оттуда; иначе матчи группируются
   *  по котлам (group_id команд), круг назначается жадно — максимум из
   *  кругов прошлых матчей участников + 1. Только чтение, ничего не пишет
   *  в БД. */
  historical110(tournamentId: number): { pockets: HistPocket[] } {
    const pockets = this.group.pockets(tournamentId);
    const rows = this.db.all<HistRow>(
        `SELECT m.id,
                m.team_1_id,
                m.team_2_id,
                g.score_1,
                g.score_2,
                m.finished,
                t1.group_id AS group_1_id,
                t1.name AS name_1,
                c1.name AS city_1,
                t2.name AS name_2,
                c2.name AS city_2,
                ps.main AS struct_main,
                ps.round AS struct_round
         FROM match_110 m
                  JOIN game_110 g ON g.match_110_id = m.id
                  JOIN team t1 ON t1.id = m.team_1_id
                  JOIN team t2 ON t2.id = m.team_2_id
                  JOIN city c1 ON c1.id = t1.city_id
                  JOIN city c2 ON c2.id = t2.city_id
                  LEFT JOIN pocket_structure ps ON ps.match_110_id = m.id
         WHERE m.tournament_id = ?
           AND m.stage IS NULL
           AND g.id = (SELECT MAX(g2.id) FROM game_110 g2 WHERE g2.match_110_id = m.id)
         ORDER BY m.id`,
        [tournamentId]
    );
    // круг команды: номер круга её последнего сыгранного (в порядке id) матча
    const lastRound = new Map<number, number>();
    const matches = rows.map(row => {
      const round = Math.max(lastRound.get(row.team_1_id) ?? 0, lastRound.get(row.team_2_id) ?? 0) + 1;
      lastRound.set(row.team_1_id, round);
      lastRound.set(row.team_2_id, round);
      const winner = row.finished === 0 ? null
          : row.score_1 > row.score_2 ? row.team_1_id
          : row.score_2 > row.score_1 ? row.team_2_id
          : null;
      const match: HistMatch = {
        id: row.id,
        team_1_id: row.team_1_id,
        team_2_id: row.team_2_id,
        team_1: {name: row.name_1, city: row.city_1},
        team_2: {name: row.name_2, city: row.city_2},
        score_1: row.score_1,
        score_2: row.score_2,
        finished: row.finished,
        winner_id: winner,
        place_1: null,
        place_2: null,
      };
      return {row, round, match};
    });
    // поражение команды учитывается только по завершённым матчам; флаги
    // «уже проиграл до этого матча» различают системы котла (см. HistPocket)
    const losses = new Map<number, number>();
    const entries = matches.map(({row, round, match}) => {
      const t1Lost = (losses.get(row.team_1_id) ?? 0) > 0;
      const t2Lost = (losses.get(row.team_2_id) ?? 0) > 0;
      if (row.finished === 1) {
        if (row.score_1 < row.score_2) losses.set(row.team_1_id, (losses.get(row.team_1_id) ?? 0) + 1);
        if (row.score_2 < row.score_1) losses.set(row.team_2_id, (losses.get(row.team_2_id) ?? 0) + 1);
      }
      return {row, round, match, t1Lost, t2Lost};
    });
    const byGroup = new Map<number, typeof entries>();
    for (const e of entries) {
      const list = byGroup.get(e.row.group_1_id) ?? [];
      list.push(e);
      byGroup.set(e.row.group_1_id, list);
    }
    // круги подмножества матчей — та же жадная реконструкция, что и для
    // общего списка: круг = max кругов прошлых матчей участников + 1
    const buildRounds = (list: typeof entries) => {
      const last = new Map<number, number>();
      const rounds: HistMatch[][] = [];
      for (const e of list) {
        const r = Math.max(last.get(e.match.team_1_id) ?? 0, last.get(e.match.team_2_id) ?? 0) + 1;
        last.set(e.match.team_1_id, r);
        last.set(e.match.team_2_id, r);
        (rounds[r - 1] ??= []).push(e.match);
      }
      return rounds;
    };
    // бай 1-го круга: команда, чей первый матч котла вообще — позже 1-го
    // круга своего дерева (НН в main со 2-го круга, Иваново-1 в cons со
    // 2-го). Проигравший основного круга r, входящий в cons с круга r, —
    // не бай: у него есть матч в main
    // порядок плашек в колонке — меньше перекрещиваний линий: идём от финала
    // к 1-му кругу и сортируем матчи по позиции следующего матча победителя
    // (питающиеся в один матч встают рядом в порядке его слот-позиции)
    const sortRounds = (rounds: HistMatch[][]) => {
      const nextPos = new Map<number, number>(); // id матча → (круг * 1000 + позиция)
      rounds.forEach((round, r) => round.forEach((m, i) => nextPos.set(m.id, r * 1000 + i)));
      for (let r = rounds.length - 2; r >= 0; r--) {
        const byWinner = new Map<number, number>(); // id победителя → ключ порядка
        for (const m of rounds[r]) {
          const w = m.winner_id;
          if (w === null) continue;
          let key = Infinity;
          for (let rr = r + 1; rr < rounds.length && key === Infinity; rr++) {
            for (const nm of rounds[rr]) {
              if (nm.team_1_id === w || nm.team_2_id === w) { key = nextPos.get(nm.id)!; break; }
            }
          }
          byWinner.set(w, key);
        }
        rounds[r].sort((a, b) =>
            (byWinner.get(a.winner_id ?? -1) ?? Infinity) - (byWinner.get(b.winner_id ?? -1) ?? Infinity));
        rounds[r].forEach((m, i) => nextPos.set(m.id, r * 1000 + i));
      }
      return rounds;
    };
    const byes = (mainRounds: HistMatch[][], consRounds: HistMatch[][]) => {
      const first = new Map<number, {cons: boolean; round: number; team: HistTeam}>();
      const scan = (rounds: HistMatch[][], cons: boolean) => rounds.forEach((round, ri) =>
          round.forEach(m => {
            for (const [id, team] of [[m.team_1_id, m.team_1], [m.team_2_id, m.team_2]] as const) {
              if (!first.has(id)) first.set(id, {cons, round: ri + 1, team});
            }
          }));
      scan(mainRounds, false);
      scan(consRounds, true);
      const pick = (cons: boolean) =>
          [...first.values()].filter(e => e.cons === cons && e.round > 1).map(e => e.team);
      return {mainByes: pick(false), consByes: pick(true)};
    };
    // итоговые места (только олимпийский режим): команда ранжируется по
    // своему последнему матчу в котле — сначала круг (main над cons при
    // равном круге: финалист выше любого игрока доигровок), затем круг
    // вылета из main (кто дольше держался в основном дереве, тот выше —
    // различает независимые матчи одного круга доигровок), затем победа
    // в последнем матче. Место проставляется в последний завершённый
    // матч команды (place_1/place_2)
    const rankPlaces = (mainRounds: HistMatch[][], consRounds: HistMatch[][]) => {
      type Last = {round: number; cons: boolean; won: boolean; match: HistMatch; side: 1 | 2; mainExit: number};
      const last = new Map<number, Last>();
      const scan = (rounds: HistMatch[][], cons: boolean) => rounds.forEach((round, ri) =>
          round.forEach(m => {
            if (m.finished !== 1) return;
            for (const side of [1, 2] as const) {
              const id = side === 1 ? m.team_1_id : m.team_2_id;
              const prev = last.get(id);
              // последний матч: доигровки позже main, внутри дерева — старше круг
              if (!prev || (cons && !prev.cons) || (cons === prev.cons && ri + 1 > prev.round)) {
                last.set(id, {
                  round: ri + 1,
                  cons,
                  won: m.winner_id === id,
                  match: m,
                  side,
                  mainExit: cons ? prev?.mainExit ?? 0 : ri + 1,
                });
              }
            }
          }));
      scan(mainRounds, false);
      scan(consRounds, true);
      const key = (e: Last) => e.round * 8 + (e.cons ? 0 : 4);
      const sorted = [...last.values()].sort((a, b) =>
          key(b) - key(a) || b.mainExit - a.mainExit || (b.won ? 1 : 0) - (a.won ? 1 : 0));
      sorted.forEach((e, i) => {
        if (e.side === 1) e.match.place_1 = i + 1;
        else e.match.place_2 = i + 1;
      });
    };
    const emptyByes = {mainByes: [] as HistTeam[], consByes: [] as HistTeam[]};
    // котлы в алфавитном порядке имён (C раньше D), матчи — по кругам
    return {
      pockets: pockets
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(p => {
            const list = byGroup.get(p.group_id) ?? [];
            // зафиксированная организатором структура надёжнее реконструкции:
            // применяется только когда размечены все матчи котла (частичная
            // разметка — признак ошибки данных, падаем на эвристику)
            if (list.length && list.every(e => e.row.struct_main !== null && e.row.struct_round !== null)) {
              const mainRounds: HistMatch[][] = [];
              const consRounds: HistMatch[][] = [];
              for (const e of list) {
                const target = e.row.struct_main === 1 ? mainRounds : consRounds;
                (target[e.row.struct_round! - 1] ??= []).push(e.match);
              }
              sortRounds(mainRounds);
              sortRounds(consRounds);
              rankPlaces(mainRounds, consRounds);
              const {mainByes, consByes} = byes(mainRounds, consRounds);
              return {
                name: p.name,
                group_id: p.group_id,
                // зафиксированная структура — олимпиада по определению
                // организатора, даже если доигровок не было
                twoLives: false,
                rounds: mainRounds,
                consRounds,
                mainByes,
                consByes,
              };
            }
            // доказательство доигровки — только завершённый матч двух уже
            // проигравших: у незавершённого победитель неизвестен, пара
            // ничего не доказывает
            const twoLives = !list.some(e => e.row.finished === 1 && e.t1Lost && e.t2Lost);
            if (twoLives) {
              return {
                name: p.name,
                group_id: p.group_id,
                twoLives,
                rounds: buildRounds(list),
                consRounds: [],
                ...emptyByes,
              };
            }
            const mainRounds = sortRounds(buildRounds(list.filter(e => !e.t1Lost && !e.t2Lost)));
            const consRounds = sortRounds(buildRounds(list.filter(e => e.t1Lost || e.t2Lost)));
            rankPlaces(mainRounds, consRounds);
            const {mainByes, consByes} = byes(mainRounds, consRounds);
            return {
              name: p.name,
              group_id: p.group_id,
              twoLives,
              rounds: mainRounds,
              consRounds,
              mainByes,
              consByes,
            };
          }),
    };
  }
}

export default BracketHistory;
