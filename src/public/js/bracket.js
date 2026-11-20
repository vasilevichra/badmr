/* Олимпийская сетка котла 110: рендер из GET /api/matches/bracket110
 * (?group=<id>). Десктоп — колонки раундов слева направо; мобайл
 * (body.phone) — вертикальный список по раундам. Карманы доигровок —
 * отдельной секцией с заголовками «Матч за N место» / «Матчи за места N–M».
 * Имена команд — window.bracketTeams (собран в index.ejs из групп). */

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

// hex цвета команды с решёткой (team_color.hex хранится без неё)
const bracketTeamColor = (teamId) => {
  const color = window.bracketTeams[teamId]?.color;
  if (!color) return null;
  return color.startsWith('#') ? color : `#${color}`;
};

// строка команды в карточке: цветная полоска, имя, счёт справа;
// у финала победитель — с кубком
const bracketTeamRow = (teamId, score, winner, trophy) => {
  const row = document.createElement('div');
  row.className = 'tournament-bracket-team' + (winner ? ' tournament-bracket-team-winner' : '');
  const stripe = document.createElement('span');
  stripe.className = 'tournament-bracket-team-stripe';
  const color = bracketTeamColor(teamId);
  if (color) stripe.style.background = color;
  const name = document.createElement('span');
  name.className = 'tournament-bracket-team-name';
  name.textContent = (winner && trophy ? '🏆 ' : '') + bracketTeamLabel(teamId);
  const scoreEl = document.createElement('span');
  scoreEl.className = 'tournament-bracket-score';
  scoreEl.textContent = score;
  row.append(stripe, name, scoreEl);
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
  // отрендеренную серверно в pocket.ejs (как ▶ в матрице). Рельс слева на
  // всю высоту карточки: кнопка «прирастает» к плашке, не торчит наружу
  if (window.bracketSignedIn && match.finished === 0 && match.game_id) {
    card.classList.add('tournament-bracket-match-rail');
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.className = 'tournament-bracket-rail';
    resume.title = 'Возобновить матч';
    resume.setAttribute('data-bs-toggle', 'modal');
    resume.setAttribute('data-bs-target', `#tournament-groups-board-${match.game_id}`);
    resume.innerHTML = '<i class="bi bi-play-fill"></i>';
    card.prepend(resume);
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
// (глобальные — вызываются инлайн-скриптом pocket.ejs)
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

// линии переходов реконструкции котлов (pocket.ejs ставит data-lines):
// сплошная — победитель идёт в следующий матч; пунктир — «вторая жизнь»
// проигравшего, только в режиме lives. Цели ищем по data-team строк команд
// в ближайшей более поздней колонке кругов.
window.renderBracketLines = () => {
  document.querySelectorAll('.tournament-bracket-pocket[data-lines]').forEach(host => {
    host.querySelectorAll('.tournament-bracket-lines').forEach(el => el.remove());
    if (document.body.classList.contains('phone')) return;
    const withLives = host.dataset.lines === 'lives';
    const cards = [...host.querySelectorAll('.tournament-bracket-match[data-mid]')];
    if (!cards.length) return;
    const hostRect = host.getBoundingClientRect();
    const rounds = [...host.querySelectorAll('.tournament-bracket-round')];
    // цели и источники: матчи; бай-плашки (data-bye) — только источники
    const colOf = new Map(
        [...host.querySelectorAll('.tournament-bracket-match')]
            .map(c => [c, rounds.indexOf(c.closest('.tournament-bracket-round'))]));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tournament-bracket-lines');
    svg.setAttribute('width', host.scrollWidth);
    svg.setAttribute('height', host.scrollHeight);
    // следующий матч команды — карточка в самой ближней колонке позже текущей
    const nextCard = (card, teamId) => {
      let best = null;
      for (const c of cards) {
        if (colOf.get(c) <= colOf.get(card)) continue;
        const mine = [...c.querySelectorAll('.tournament-bracket-team')]
            .some(t => Number(t.dataset.team) === teamId);
        if (mine && (!best || colOf.get(c) < colOf.get(best))) best = c;
      }
      return best;
    };
    // ортогональный локоть от правого края исхода к левому краю цели;
    // цвет — от цвета команды-источника строки (переход победителя)
    const line = (from, to, cls, color) => {
      const f = from.getBoundingClientRect();
      const t = to.getBoundingClientRect();
      const x1 = f.right - hostRect.left;
      const y1 = f.top + f.height / 2 - hostRect.top;
      const x2 = t.left - hostRect.left;
      const y2 = t.top + t.height / 2 - hostRect.top;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} L ${(x1 + x2) / 2} ${y1} L ${(x1 + x2) / 2} ${y2} L ${x2} ${y2}`);
      path.setAttribute('class', cls);
      if (color) path.setAttribute('stroke', color);
      svg.append(path);
    };
    [...host.querySelectorAll('.tournament-bracket-match')].forEach(card => {
      const rows = [...card.querySelectorAll('.tournament-bracket-team')];
      // у бай-плашки «переход» — её единственная команда; lives из бая не бывает
      const winner = card.dataset.bye
          ? rows.find(r => Number(r.dataset.team) === Number(card.dataset.bye))
          : rows.find(r => r.classList.contains('tournament-bracket-team-winner'));
      if (!winner) return; // незавершённый матч или ничья — переходов нет
      const wNext = nextCard(card, Number(winner.dataset.team));
      if (wNext) line(card, wNext, 'tournament-bracket-line-win', bracketTeamColor(Number(winner.dataset.team)));
      if (withLives && !card.dataset.bye) {
        const loser = rows.find(r => r !== winner);
        const lNext = loser && nextCard(card, Number(loser.dataset.team));
        if (lNext) line(card, lNext, 'tournament-bracket-line-life');
      }
    });
    host.prepend(svg);
  });
};
window.addEventListener('resize', () => window.renderBracketLines());
