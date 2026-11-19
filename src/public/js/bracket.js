/* Олимпийская сетка 110: рендер из GET /api/matches/bracket110.
 * Десктоп — колонки раундов слева направо; мобайл (body.phone) —
 * вертикальный список по раундам. Карманы доигровок — отдельной
 * секцией с заголовками «Матч за N место» / «Матчи за места N–M».
 * Имена команд — window.bracketTeams (собран в bracket.ejs из групп). */

// ключ слота → матч; в слоте без матча — «ожидается соперник»
const bracketMatchBySlot = (data) => {
  const map = {};
  data.matches.forEach(m => {
    map[`${m.slot.stage}|${m.slot.round}|${m.slot.pos}`] = m;
  });
  return map;
};

// «город — название»; без города — просто название
const bracketTeamLabel = (teamId) => {
  const t = window.bracketTeams[teamId];
  if (!t) return '—';
  return t.city ? `${t.city} — ${t.name}` : t.name;
};

// строка команды в карточке: имя слева, счёт справа; у финала победитель — с кубком
const bracketTeamRow = (teamId, score, winner, trophy) => {
  const row = document.createElement('div');
  row.className = 'tournament-bracket-team' + (winner ? ' tournament-bracket-team-winner' : '');
  const name = document.createElement('span');
  name.className = 'tournament-bracket-team-name';
  name.textContent = (winner && trophy ? '🏆 ' : '') + bracketTeamLabel(teamId);
  const scoreEl = document.createElement('span');
  scoreEl.className = 'tournament-bracket-score';
  scoreEl.textContent = score;
  row.append(name, scoreEl);
  return row;
};

// карточка матча (или пустого слота) сетки; opts:
//   final — решающий матч (зелёная рамка, кубок у победителя),
//   cons — матч доигровки (пунктирная рамка),
//   placeTag — подпись итоговых мест в углу карточки
const bracketMatchCard = (match, opts = {}) => {
  const card = document.createElement('div');
  card.className = 'tournament-bracket-match';
  if (opts.final) card.classList.add('tournament-bracket-match-final');
  if (opts.cons) card.classList.add('tournament-bracket-match-cons');
  // подпись итоговых мест — и на пустом слоте решающего матча (как в макете)
  if (opts.placeTag) {
    const place = document.createElement('div');
    place.className = 'tournament-bracket-place';
    place.textContent = opts.placeTag;
    card.append(place);
  }
  if (!match) {
    card.classList.add('tournament-bracket-match-empty');
    const placeholder = document.createElement('div');
    placeholder.className = 'tournament-bracket-empty';
    placeholder.textContent = 'ожидается соперник';
    card.append(placeholder);
    return card;
  }
  const winner1 = match.finished === 1 && match.score_1 > match.score_2;
  const winner2 = match.finished === 1 && match.score_2 > match.score_1;
  card.append(
      bracketTeamRow(match.team_1_id, match.score_1, winner1, opts.final),
      bracketTeamRow(match.team_2_id, match.score_2, winner2, opts.final)
  );
  // идущий матч — кнопка возобновления: открывает модалку табло,
  // отрендеренную серверно в bracket.ejs (как ▶ в матрице)
  if (window.bracketSignedIn && match.finished === 0 && match.game_id) {
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.className = 'btn btn-outline-success btn-sm game-result-resume tournament-bracket-resume';
    resume.title = 'Возобновить матч';
    resume.setAttribute('data-bs-toggle', 'modal');
    resume.setAttribute('data-bs-target', `#tournament-groups-board-${match.game_id}`);
    resume.innerHTML = '<i class="bi bi-play"></i>';
    card.append(resume);
  }
  return card;
};

// название раунда верхней сетки: r=R — финал, ниже — «1/2», «1/4» …
const bracketRoundTitle = (round, totalRounds) => {
  if (round === totalRounds) return 'Финал';
  if (round === totalRounds - 1) return '1/2 финала';
  return `1/${2 ** (totalRounds - round)} финала`;
};

// десктоп: колонки верхней сетки, ниже — секции карманов доигровок
// (глобальные — вызываются инлайн-скриптом bracket.ejs)
window.renderBracket = (host, data) => {
  host.innerHTML = '';
  const map = bracketMatchBySlot(data);
  const slots = data.structure.slots;

  const wrap = document.createElement('div');
  wrap.className = 'tournament-bracket-upper';
  const totalRounds = Math.log2(data.structure.size);
  for (let r = 1; r <= totalRounds; r++) {
    const round = slots.filter(s => s.stage === 'upper' && s.round === r);
    if (round.length === 0) continue;
    const col = document.createElement('div');
    col.className = 'tournament-bracket-round';
    const title = document.createElement('div');
    title.className = 'tournament-bracket-round-title';
    title.textContent = bracketRoundTitle(r, totalRounds);
    // матчи — в отдельном контейнере с равномерным распределением:
    // пары следующего круга сходятся между парами предыдущего (дерево)
    const matches = document.createElement('div');
    matches.className = 'tournament-bracket-round-matches';
    round.forEach(slot => {
      // финал верхней сетки — решающий матч за 1–2 места
      const opts = r === totalRounds ? {final: true, placeTag: '1–2 места'} : {};
      matches.append(bracketMatchCard(map[`upper|${r}|${slot.pos}`], opts));
    });
    col.append(title, matches);
    wrap.append(col);
  }
  host.append(wrap);

  // карманы доигровок: группировка по диапазону мест (слоты одного
  // кармана делят placeFrom/placeTo), от финальных мест к последним.
  // Терминальный карман — из его слотов не питается ни один слот сетки:
  // его финал и определяет итоговые места, остальные — промежуточные
  const lower = slots.filter(s => s.stage === 'lower');
  const pockets = new Map();
  lower.forEach(slot => {
    const key = `${slot.placeFrom}-${slot.placeTo}`;
    if (!pockets.has(key)) pockets.set(key, []);
    pockets.get(key).push(slot);
  });
  const fedRefs = new Set(lower.flatMap(s => s.feeders?.map(f => `${f.stage}|${f.round}|${f.pos}`) ?? []));
  const isTerminalPocket = (pocketSlots) => !pocketSlots.some(s => fedRefs.has(`lower|${s.round}|${s.pos}`));
  [...pockets.entries()].sort((a, b) => Number(a[0].split('-')[0]) - Number(b[0].split('-')[0])).forEach(([key, pocketSlots]) => {
    const [from, to] = key.split('-').map(Number);
    const section = document.createElement('div');
    section.className = 'tournament-bracket-pocket';
    const title = document.createElement('h4');
    title.className = 'tournament-bracket-pocket-title';
    title.textContent = from === to ? `Матч за ${from} место` : `Матчи за места ${from}–${to}`;
    const cols = document.createElement('div');
    cols.className = 'tournament-bracket-pocket-rounds';
    const visibleRounds = [...new Set(pocketSlots.map(s => s.round))].sort((a, b) => a - b);
    for (const r of visibleRounds) {
      const roundSlots = pocketSlots.filter(s => s.round === r);
      const col = document.createElement('div');
      col.className = 'tournament-bracket-round';
      // заголовки кругов — только в кармане из нескольких кругов:
      // «1/2 доигровок», «Финал доигровок»; одиночный круг описывает h4 секции
      if (visibleRounds.length > 1) {
        const roundTitle = document.createElement('div');
        roundTitle.className = 'tournament-bracket-round-title';
        roundTitle.textContent = r === visibleRounds[visibleRounds.length - 1] ? 'Финал доигровок' : `1/${2 ** (visibleRounds[visibleRounds.length - 1] - r)} доигровок`;
        col.append(roundTitle);
      }
      const matches = document.createElement('div');
      matches.className = 'tournament-bracket-round-matches';
      roundSlots.forEach(slot => {
        const card = bracketMatchCard(map[`lower|${r}|${slot.pos}`], {
          cons: true,
          // финал терминального кармана определяет итоговые места
          placeTag: isTerminalPocket(pocketSlots) && r === visibleRounds[visibleRounds.length - 1]
              ? (from === to ? `${from} место` : `${from}–${to} места`) : null,
        });
        matches.append(card);
      });
      col.append(matches);
      cols.append(col);
    }
    section.append(title, cols);
    host.append(section);
  });
};

// мобайл: вертикальный список — раунды верхней сетки, ниже карманы
// доигровок с теми же заголовками (пунктирную стрелку ставит CSS)
window.renderBracketMobile = (host, data) => {
  host.innerHTML = '';
  const map = bracketMatchBySlot(data);
  const slots = data.structure.slots;

  const list = document.createElement('div');
  list.className = 'tournament-bracket-mobile';
  const totalRounds = Math.log2(data.structure.size);
  for (let r = 1; r <= totalRounds; r++) {
    const round = slots.filter(s => s.stage === 'upper' && s.round === r);
    if (round.length === 0) continue;
    const title = document.createElement('h4');
    title.className = 'tournament-bracket-pocket-title';
    title.textContent = bracketRoundTitle(r, totalRounds);
    list.append(title);
    round.forEach(slot => list.append(bracketMatchCard(map[`upper|${r}|${slot.pos}`])));
  }
  const lower = slots.filter(s => s.stage === 'lower');
  const pockets = new Map();
  lower.forEach(slot => {
    const key = `${slot.placeFrom}-${slot.placeTo}`;
    if (!pockets.has(key)) pockets.set(key, []);
    pockets.get(key).push(slot);
  });
  [...pockets.entries()].sort((a, b) => Number(a[0].split('-')[0]) - Number(b[0].split('-')[0])).forEach(([key, pocketSlots]) => {
    const [from, to] = key.split('-').map(Number);
    const title = document.createElement('h4');
    title.className = 'tournament-bracket-pocket-title';
    title.textContent = from === to ? `Матч за ${from} место` : `Матчи за места ${from}–${to}`;
    list.append(title);
    const maxRound = Math.max(...pocketSlots.map(s => s.round));
    for (let r = 1; r <= maxRound; r++) {
      pocketSlots.filter(s => s.round === r).forEach(slot => {
        const card = bracketMatchCard(map[`lower|${r}|${slot.pos}`], {cons: true});
        card.classList.add('tournament-bracket-pocket-mobile');
        list.append(card);
      });
    }
  });
  host.append(list);
};
