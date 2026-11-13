// незавершённые матчи, известные странице: исчезновение id из списка
// /api/matches/unfinished — признак завершения матча (кроме удалённых)
const seenUnfinished = new Set();
// матчи, удалённые с этой страницы: их исчезновение — не завершение
const deletedUnfinished = new Set();
// последний список незавершённых матчей (по счётчику формы — матча):
// данные матча для табло (игроки, корт) без нового запроса
let unfinishedMatches = [];

/** Матч завершился: сразу предложить подбор — раскрыть блок «Подбор»,
 *  перевести на него фокус и раскрыть пары. Сколько матчей предлагать —
 *  считает сервер: столько, сколько нужно сыграть до окончания турнира,
 *  но не больше свободных кортов. */
const onMatchFinished = () => {
  if (document.body.dataset.tournamentStatus !== '2') return;
  const selectButton = $('#select-button');
  if (!selectButton.length) return;
  scrollToId('select');
  selectButton.trigger('click');
};

const renderGames = () => {
  $.getJSON("/api/matches/unfinished", matches => {
    unfinishedMatches = matches;
    const unfinishedIds = new Set(matches.map(m => Number(m.id)));
    const disappeared = [...seenUnfinished].filter(id => !unfinishedIds.has(id));
    for (const id of disappeared) {
      seenUnfinished.delete(id);
      if (deletedUnfinished.has(id)) {
        deletedUnfinished.delete(id);
      } else {
        onMatchFinished();
      }
    }
    for (const id of unfinishedIds) seenUnfinished.add(id);
    // матч завершился (или удалён) — пересчитываем прогресс турнира
    if (disappeared.length) renderTournamentProgress();

    if (matches.length > 0) {
      $('.game-info').hide();

      const gameBlock = $('#game-block');
      gameBlock.empty();
      const formTemplate = isPhone() ? gameFormPhoneTemplate : gameFormTemplate;
      $.each(matches, (i, match) => {
        $(formTemplate(i)).appendTo(gameBlock);

        fillMatch(i, match);
      });
    } else {
      // незавершённых матчей нет (последний завершён или удалён):
      // формы игр больше не нужны, возвращаем заглушку
      $('.game-form').remove();
      $('.game-info').show();
    }
  });
  // сохранение значений счёта игр в печеньки и блокировка/разблокировка input-полей
  // делегированный обработчик вешается один раз: renderGames вызывается
  // и при создании матча, и при периодическом обновлении зала
  if (!$(document.body).data('game-input-bound')) {
    $(document.body).data('game-input-bound', true);
  $(document.body).on('change keydown keypress keyup mousedown click mouseup', '.game-input', function () {
    const value = Number($(this).val());
    const id = $(this).attr('id');
    const cookieId = $(this).attr('ids');
    const counter = Number(id.slice(-1));

    const handleGameScoreNum = (i) => {
      if (id === `game-input-${i}1-${counter}`) {
        $(`#game-input-${i}2-${counter}`).val(winValue(value)).prop('disabled', true).addClass('no-selection fw-bolder');
      }
      if (id === `game-input-${i}2-${counter}`) {
        $(`#game-input-${i}1-${counter}`).val(winValue(value)).prop('disabled', true).addClass('no-selection fw-bolder');
      }
    }

    const unlockGameScoreNum = (i) => {
      if ([`game-input-${i - 1}1-${counter}`, `game-input-${i - 1}2-${counter}`].includes(id)) {
        $([`${i}1-${counter}`, `${i}2-${counter}`].map(i => `#game-input-${i}`).join(', ')).each((i, el) => {
          $(el).prop('disabled', false).attr("placeholder", i + 1);
        });
      }
    }

    const cleanGameScoreNum = (i) => {
      if (id === `game-input-${i}1-${counter}`) {
        $(`#${id}`).attr("placeholder", 1);
        $(`#game-input-${i}2-${counter}`).val('').prop('disabled', false).removeClass('no-selection fw-bolder').attr("placeholder", 2);
      }
      if (id === `game-input-${i}2-${counter}`) {
        $(`#${id}`).attr("placeholder", 2);
        $(`#game-input-${i}1-${counter}`).val('').prop('disabled', false).removeClass('no-selection fw-bolder').attr("placeholder", 1);
      }
    }

    const gameSubmitButton = $(`#game-form-button-submit-${counter}`);

    const unlockSubmitButton = () =>
        gameSubmitButton
        .removeClass('btn-outline-success')
        .addClass('btn-success')
        .prop('disabled', false);

    const lockSubmitButton = () =>
        gameSubmitButton
        .removeClass('btn-success')
        .addClass('btn-outline-success')
        .prop('disabled', true);

    if (value) {
      handleGameScoreNum(1);
      unlockGameScoreNum(2);

      handleGameScoreNum(2);

      const field11 = $(`#game-input-11-${counter}:not(:disabled)`).val();
      const field12 = $(`#game-input-12-${counter}:not(:disabled)`).val();
      const field21 = $(`#game-input-21-${counter}:not(:disabled)`).val();
      const field22 = $(`#game-input-22-${counter}:not(:disabled)`).val();

      const need3 = !((field11 && field21) || (field12 && field22));

      if (need3) {
        unlockGameScoreNum(3);
        handleGameScoreNum(3);
      } else {
        unlockSubmitButton();
      }

      const field31 = $(`#game-input-31-${counter}:not(:disabled)`).val();
      const field32 = $(`#game-input-32-${counter}:not(:disabled)`).val();

      if (need3 && (field31 || field32)) {
        unlockSubmitButton();
      }

      $.cookie(cookieId, value);
    } else {
      cleanGameScoreNum(getGameRowNum(id));
      lockSubmitButton();

      $.removeCookie(cookieId);
      $.removeCookie(cookieId2cookieDateId(cookieId));
    }
  });

  // сохранение значений времени игр в печеньки
  $(document.body).on('change', '.game-input', function () {
    const value = $(this).val();
    const cookieDateId = cookieId2cookieDateId($(this).attr('ids'));
    if (value && !$.cookie(cookieDateId)) {
      $.cookie(cookieDateId, date2DatabaseFormat());
    }
  });
  }
}

const fillMatch = (counter, match) => {
  $(`#game-table-1-${counter}`)
  .bootstrapTable({
    showHeader: false,
    columns: [{
      field: 'name',
      title: 'Name',
      formatter: (value, row) => this.share.playerNameFormatter(row.id, value, row.sex, row.pic, isPhone()),
      cellStyle: (value, row) => playerSexStyle(row.sex)
    }],
    data: [{
      id: match.user_1_id,
      name: match.name1,
      sex: match.sex1,
      pic: match.pic1
    }, {
      id: match.user_2_id,
      name: match.name2,
      sex: match.sex2,
      pic: match.pic2
    }]
  });

  $(`#game-table-2-${counter}`)
  .bootstrapTable({
    showHeader: false,
    columns: [{
      field: 'name',
      title: 'Name',
      formatter: (value, row) => this.share.playerNameFormatter(row.id, value, row.sex, row.pic, isPhone()),
      cellStyle: (value, row) => playerSexStyle(row.sex)
    }],
    data: [{
      id: match.user_3_id,
      name: match.name3,
      sex: match.sex3,
      pic: match.pic3
    }, {
      id: match.user_4_id,
      name: match.name4,
      sex: match.sex4,
      pic: match.pic4
    }]
  });

  $(`#game-form-info-${counter}`).text(`Матч №${match.id}, корт №${match.court}`);

  // выставление значения счёта игр из печенек при перезагрузке страницы
  for (let i = 1; i <= 3; i++) {
    for (let j = 1; j <= 2; j++) {
      const id = userIds2cookieId([match.user_1_id, match.user_2_id, match.user_3_id, match.user_4_id], i, j);
      $(`#game-input-${i}${j}-${counter}`).attr('ids', id);
      if ($.cookie(id)) {
        $(`input[ids='${id}']`).val($.cookie(id)).trigger('click');
      }
    }
  }

  $(`#game-form-button-submit-${counter}`).off('click').click((event) => {
    event.preventDefault();

    const gamePoint11 = $(`#game-input-11-${counter}:not(:disabled)`).val() || '';
    const gamePoint12 = $(`#game-input-12-${counter}:not(:disabled)`).val() || '';
    const gamePoint21 = $(`#game-input-21-${counter}:not(:disabled)`).val() || '';
    const gamePoint22 = $(`#game-input-22-${counter}:not(:disabled)`).val() || '';
    const gamePoint31 = $(`#game-input-31-${counter}:not(:disabled)`).val() || '';
    const gamePoint32 = $(`#game-input-32-${counter}:not(:disabled)`).val() || '';

    if (gamePoint11 === '' && gamePoint12 === '') {
      alert('Введите результат первой игры');
      return false;
    }

    if (gamePoint21 === '' && gamePoint22 === '') {
      alert('Введите результат второй игры');
      return false;
    }

    const is11 = gamePoint12 === '' || (gamePoint11 !== '' && gamePoint11 < gamePoint12);
    const is21 = gamePoint22 === '' || (gamePoint21 !== '' && gamePoint21 < gamePoint22);
    const is31 = gamePoint32 === '' || (gamePoint31 !== '' && gamePoint31 < gamePoint32);
    const need3 = !((is11 && is21) || (!is11 && !is21));

    if (need3 && gamePoint31 === '' && gamePoint32 === '') {
      alert('Введите результат третьей игры');
      return false;
    }

    // игры сохраняются параллельными запросами; обновления таблиц и прогресса
    // выполняются после завершения всех — иначе гонка: обновление по старым данным
    const saving = [];

    if (is11) {
      const cookieId11 = $(`#game-input-11-${counter}`).attr('ids');
      const cookieDateId11 = cookieId2cookieDateId(cookieId11);
      saving.push($.ajax({
        url: '/api/games/create',
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json; charset=utf-8',
        data: JSON.stringify({
          match_id: match.id,
          lost_1_by: gamePoint11,
          lost_2_by: null,
          created_at: $.cookie(cookieDateId11)
        }),
        success: function (result) {
          $.removeCookie(cookieId11);
          $.removeCookie(cookieDateId11);
        },
        error: function (err) {
          alert(JSON.stringify(err, null, 2));
        }
      }));
    } else {
      const cookieId12 = $(`#game-input-12-${counter}`).attr('ids');
      const cookieDateId12 = cookieId2cookieDateId(cookieId12);
      saving.push($.ajax({
        url: '/api/games/create',
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json; charset=utf-8',
        data: JSON.stringify({
          match_id: match.id,
          lost_1_by: null,
          lost_2_by: gamePoint12,
          created_at: $.cookie(cookieDateId12)
        }),
        success: function (result) {
          $.removeCookie(cookieId12);
          $.removeCookie(cookieDateId12);
        },
        error: function (err) {
          alert(JSON.stringify(err, null, 2));
        }
      }));
    }

    if (is21) {
      const cookieId21 = $(`#game-input-21-${counter}`).attr('ids');
      const cookieDateId21 = cookieId2cookieDateId(cookieId21);
      saving.push($.ajax({
        url: '/api/games/create',
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json; charset=utf-8',
        data: JSON.stringify({
          match_id: match.id,
          lost_1_by: gamePoint21,
          lost_2_by: null,
          created_at: $.cookie(cookieDateId21)
        }),
        success: function (result) {
          $.removeCookie(cookieId21);
          $.removeCookie(cookieDateId21);
        },
        error: function (err) {
          alert(JSON.stringify(err, null, 2));
        }
      }));
    } else {
      const cookieId22 = $(`#game-input-22-${counter}`).attr('ids');
      const cookieDateId22 = cookieId2cookieDateId(cookieId22);
      saving.push($.ajax({
        url: '/api/games/create',
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json; charset=utf-8',
        data: JSON.stringify({
          match_id: match.id,
          lost_1_by: null,
          lost_2_by: gamePoint22,
          created_at: $.cookie(cookieDateId22)
        }),
        success: function (result) {
          $.removeCookie(cookieId22);
          $.removeCookie(cookieDateId22);
        },
        error: function (err) {
          alert(JSON.stringify(err, null, 2));
        }
      }));
    }
    if (need3) {
      if (is31) {
        const cookieId31 = $(`#game-input-31-${counter}`).attr('ids');
        const cookieDateId31 = cookieId2cookieDateId(cookieId31);
        saving.push($.ajax({
          url: '/api/games/create',
          type: 'POST',
          dataType: 'json',
          contentType: 'application/json; charset=utf-8',
          data: JSON.stringify({
            match_id: match.id,
            lost_1_by: gamePoint31,
            lost_2_by: null,
            created_at: $.cookie(cookieDateId31)
          }),
          success: function (result) {
            $.removeCookie(cookieId31);
            $.removeCookie(cookieDateId31);
          },
          error: function (err) {
            alert(JSON.stringify(err, null, 2));
          }
        }));
      } else {
        const cookieId32 = $(`#game-input-32-${counter}`).attr('ids');
        const cookieDateId32 = cookieId2cookieDateId(cookieId32);
        saving.push($.ajax({
          url: '/api/games/create',
          type: 'POST',
          dataType: 'json',
          contentType: 'application/json; charset=utf-8',
          data: JSON.stringify({
            match_id: match.id,
            lost_1_by: null,
            lost_2_by: gamePoint32,
            created_at: $.cookie(cookieDateId32)
          }),
          success: function (result) {
            $.removeCookie(cookieId32);
            $.removeCookie(cookieDateId32);
          },
          error: function (err) {
            alert(JSON.stringify(err, null, 2));
          }
        }));
      }
    }

    $(`#game-form-${counter}`).hide();

    $.when(...saving).always(() => {
      show.player.column.delta_today();
      refresh.table.player();
      refresh.table.court();
      // результаты сохранены — пересчитываем прогресс турнира
      renderTournamentProgress();

      if ($('.game-form-button-submit:visible').length === 0) {
        $('.game-form').remove();
        $('.game-info').show();
      }

      refresh.block.by.id('match-history-block'); // обновление блока истории матчей
      // первый матч турнира: блок истории появляется без перезагрузки страницы
      $('#match-history-container').removeClass('d-none');
    });
  });

  $(`#game-form-button-reset-${counter}`).off('click').click(event => {
    event.preventDefault();

    if (confirm(`Удалить матч №${match.id}?`)) {
      for (let i = 1; i <= 3; i++) {
        for (let j = 1; j <= 2; j++) {
          const cookieId = $(`#game-input-${i}${j}-${counter}`).attr('ids');
          $.removeCookie(cookieId);
          $.removeCookie(cookieId2cookieDateId(cookieId));
        }
      }
      $.post(`/api/matches/delete/${match.id}`, {}, () => {
        deletedUnfinished.add(Number(match.id)); // исчезновение из списка — не завершение
        $(`#game-form-${counter}`).remove();
        if ($('#game-block > div').length === 0) {
          refresh.block.by.id('game'); // обновление блока игры
        }

        refresh.table.player(); // игроки снова доступны — триггер удаления матча вернул их в подбор
        refresh.table.court();

        // история матчей: перечитываем с сервера и прячем, если матчей не осталось
        $('#match-history').load(`${location.href} #match-history>*`, '', () => {
          if ($('#match-history-block').children().length === 0) {
            $('#match-history-container').addClass('d-none');
          }
        });
      });
    }
  });
}

// разметка форм игр берётся из <template id="game-form-template"> и
// <template id="game-form-phone-template"> (game-form.ejs), __i__ заменяется на номер формы
const gameFormTemplate = (counter) => $('#game-form-template').html().replaceAll('__i__', counter);

const gameFormPhoneTemplate = (counter) => $('#game-form-phone-template').html().replaceAll('__i__', counter);

const cookieId2cookieDateId = (cookieId) => cookieId.slice(0, -2).concat('-date');
const getGameRowNum = (id) => Number(id.charAt(11));
const userIds2cookieId = (ids, gameCounter, pairCounter) => `${ids.sort((a, b) => a - b).join('-')}_${gameCounter}-${pairCounter}`;

// ===== живое табло Новой лиги =====

// разметка — из <template id="game-board-template"> (game-form.ejs),
// __i__ заменяется на id матча
const gameBoardTemplate = (matchId) => $('#game-board-template').html().replaceAll('__i__', matchId);

// состояние табло на матч: match — данные из /api/matches/unfinished
// (игроки, корт), swapped — стороны поменяны (рендер пишется в фиксированные
// колонки: слева та команда, что встала слева после последнего свапа),
// halfSwapped — свап половинного счёта решающей игры уже выполнен
const gameBoardState = new Map();

// аватары с именами игроков пары под счётом (названий команд на табло нет).
// Значки только для Новой лиги (tournament_type = 1): слева снизу аватарки —
// «палочки» корта игрока (две — чётный/правый корт, одна — нечётный/левый;
// пары меняются кортами, выигрывая очко на своей подаче), справа снизу —
// воланчик у подающего (в начале матча задаётся двойным кликом по игроку
// на 0:0, дальше пересчитывается сервером при каждом очке)
const PARITY_EVEN_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.2" y="1" width="2.6" height="10" rx="1.3" fill="currentColor"/><rect x="7.2" y="1" width="2.6" height="10" rx="1.3" fill="currentColor"/></svg>';
const PARITY_ODD_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="4.7" y="1" width="2.6" height="10" rx="1.3" fill="currentColor"/></svg>';

const gameBoardPlayersHtml = (players, meta) => {
  const nl = document.body.dataset.tournamentType === '1';
  return players.map(p => `
    <div class="board-player" data-user-id="${p.id}">
        <span class="board-player-avatar" title="${p.name}">${share.playerAvatarFormatter(p.pic, p.name, p.sex)}${nl ? `
            <i class="board-parity ${meta.even === p.id ? 'board-parity-even' : 'board-parity-odd'}" title="${meta.even === p.id ? 'Чётный корт' : 'Нечётный корт'}" aria-hidden="true">${meta.even === p.id ? PARITY_EVEN_SVG : PARITY_ODD_SVG}</i>${meta.serve === p.id ? `
            <i class="board-serve" title="Подаёт" aria-hidden="true"></i>` : ''}` : ''}
        </span>
        <div class="board-player-name">${p.name}</div>
    </div>`).join('');
};

// рендер счёта и игроков в фиксированные колонки с учётом свапа:
// слева та команда, что встала слева после последнего свапа. Колонки
// меняются содержимым целиком (счёт + игроки + data-team-number — номер
// команды, чей счёт в колонке сейчас; на нём держатся клик и свайп).
// gameNo — порядковый номер игры (1–3): текущая выделена, сыгранные серым
const renderGameBoard = (matchId, score_1, score_2, gameNo) => {
  const modal = $(`#game-board-${matchId}`)[0];
  const state = gameBoardState.get(matchId);
  const [leftTeam, rightTeam] = state.swapped ? [2, 1] : [1, 2];
  const score = {1: score_1, 2: score_2};
  const players = {1: [state.match.user_1_id, state.match.user_2_id], 2: [state.match.user_3_id, state.match.user_4_id]};
  // чётность кортов (null — база: первый в паре) и подающий — из состояния,
  // обновляемого ответами сервера (очки, двойной клик, текущая игра)
  const even = {1: state.even_1_user_id ?? state.match.user_1_id, 2: state.even_2_user_id ?? state.match.user_3_id};
  const serveUser = state.serve_user_id ?? null;
  const cols = modal.querySelectorAll('.game-board-col');
  [leftTeam, rightTeam].forEach((team, i) => {
    const col = cols[i];
    const scoreEl = col.querySelector('.game-board-score');
    scoreEl.setAttribute('data-team-number', team);
    if (scoreEl.textContent !== String(score[team])) scoreEl.textContent = score[team];
    const playersEl = col.querySelector('.game-board-players');
    // пара стоит по кортам: чётный (правый корт) — первым. Когда пара
    // выигрывает очко на своей подаче, напарники меняются кортами —
    // на табло они меняются местами (палочки при игроках)
    const pair = players[team].map(id => {
      const n = [1, 2, 3, 4].find(k => state.match[`user_${k}_id`] === id);
      return {id, name: state.match[`name${n}`], sex: state.match[`sex${n}`], pic: state.match[`pic${n}`]};
    }).sort((a, b) => (a.id === even[team] ? -1 : b.id === even[team] ? 1 : 0));
    const html = gameBoardPlayersHtml(pair, {even: even[team], serve: serveUser});
    if (playersEl.innerHTML !== html) playersEl.innerHTML = html;
  });
  // номера игр: сыгранные — серым (secondary-info, как в 110), текущая —
  // выделена, будущие — обычные
  if (gameNo) {
    modal.querySelectorAll('.game-board-game').forEach(el => {
      const n = Number(el.getAttribute('data-game-number'));
      el.classList.toggle('secondary-info', n < gameNo);
      el.classList.toggle('board-game-type-current', n === gameNo);
    });
  }
  // ручная смена сторон — только в первой игре матча при 0:0 (как в 110):
  // на первом очке и в последующих играх кнопка прячется — стороны там
  // меняет игра (между играми и на половинном счёте решающей)
  const swapBtn = modal.querySelector('.board-swap');
  if (swapBtn) swapBtn.hidden = score_1 !== 0 || score_2 !== 0
      || ((state.wins_1 ?? 0) + (state.wins_2 ?? 0)) > 0;
};

// клик и свайп по полю счёта: клик — +1 очко, свайп вверх — +1, свайп вниз
// — −1 (корректировка судьёй). Свои обработчики (в lib.js — хардкод 110:
// чтение data-team-1-id и свои эндпоинты), поэтому в addScoreBoardHandlers
// добавлен guard на отсутствие data-team-1-id — табло Новой лиги он
// пропускает. preventDefault гасит синтетический click после свайпа
const gameBoardScore = (el, up) => {
  const matchId = Number(el.closest('.modal').id.replace('game-board-', ''));
  const team = el.getAttribute('data-team-number');
  $.post(`/api/games/current/${up ? 'increase' : 'decrease'}?match_id=${matchId}&team_number=${team}`,
      result => gameBoardResult(matchId, el, result, up));
};

// результат игры, сыгранной на табло, — сразу в инпуты формы матча:
// проигравшей стороне — её очко, победившей — winValue (как при ручном
// вводе, но без обработчика .game-input: он не принимает 0 очков
// проигравшего). Печенька — чтобы при перезагрузке формы результат
// не пропал; следующая игра и кнопка сохранения разблокируются
const fillFormGameResult = (matchId, gameNo, loserTeam, lostBy) => {
  const counter = unfinishedMatches.findIndex(m => Number(m.id) === matchId);
  if (counter < 0 || gameNo < 1 || gameNo > 3) return;
  const loserInput = $(`#game-input-${gameNo}${loserTeam}-${counter}`);
  if (!loserInput.length || loserInput.prop('disabled')) return;
  const winnerInput = $(`#game-input-${gameNo}${loserTeam === 1 ? 2 : 1}-${counter}`);
  loserInput.val(lostBy);
  winnerInput.val(winValue(Number(lostBy))).prop('disabled', true).addClass('no-selection fw-bolder');
  if (lostBy) $.cookie(loserInput.attr('ids'), lostBy);
  for (let k = 1; k <= 2; k++) {
    $(`#game-input-${gameNo + 1}${k}-${counter}`).prop('disabled', false).attr('placeholder', k);
  }
  $(`#game-form-button-submit-${counter}`)
      .removeClass('btn-outline-success').addClass('btn-success').prop('disabled', false);
};

const gameBoardResult = (matchId, el, result, up) => {
  // подача и чётность кортов пересчитаны сервером — запоминаем для рендера
  const state = gameBoardState.get(matchId);
  if (state) {
    if (result.serve_user_id !== undefined) state.serve_user_id = result.serve_user_id;
    if (result.even_1_user_id !== undefined) state.even_1_user_id = result.even_1_user_id;
    if (result.even_2_user_id !== undefined) state.even_2_user_id = result.even_2_user_id;
    if (result.wins_1 !== undefined) {
      state.wins_1 = result.wins_1;
      state.wins_2 = result.wins_2;
    }
  }
  // порядковый номер игры (1–3): сколько записано + идущая/следующая
  const gameNo = result.wins_1 + result.wins_2 + (result.match_over ? 0 : 1);
  renderGameBoard(matchId, result.score_1, result.score_2, gameNo);
  if (!up) {
    boardBeep(220, 0.1, 0.2);
    return;
  }
  navigator.vibrate?.(30);
  boardBeep();
  if (result.game_over) {
    // конец игры: вспышка счёта + сигнал, автосмена сторон (после каждой
    // игры стороны меняются — счёт идёт за командой, колонки меняются
    // содержимым через data-team-number). Новая игра начинается с 0:0:
    // счёт завершённой не показываем, первую игру она создаст первым очком
    flashPartyWin(el);
    state.swapped = !state.swapped;
    renderGameBoard(matchId, 0, 0);
    // зеркалим результат в форму матча (после матча форма уйдёт в историю
    // через renderGames — там результат уже есть в БД)
    if (!result.match_over) {
      fillFormGameResult(matchId, result.wins_1 + result.wins_2, result.winner === 1 ? 2 : 1, result.lost_by);
    }
    if (result.match_over) {
      // матч окончен: форма уходит в историю — пересоздаём блок игр,
      // табло закрываем
      bootstrap.Modal.getInstance($(`#game-board-${matchId}`)[0])?.hide();
      renderGames();
    }
    return;
  }
  // решающая игра (при 1:1 по играм): автоматический свап на половинном
  // счёте — порог Math.ceil(game_point / 2) (21→11, 15→8, 11→6); смена,
  // когда порог впервые достигнут лидером
  const threshold = Math.ceil(state.game_point / 2);
  const deciding = result.wins_1 === 1 && result.wins_2 === 1;
  if (deciding && !state.halfSwapped && Math.max(result.score_1, result.score_2) >= threshold) {
    state.halfSwapped = true;
    state.swapped = !state.swapped;
    renderGameBoard(matchId, result.score_1, result.score_2);
    boardBeep(440, 0.1, 0.3);
  }
};

// свайпы табло Новой лиги — по аналогии с 110 (lib.js), но со своими
// эндпоинтами и без data-team-1-id
document.addEventListener('touchstart', (e) => {
  const scoreEl = e.target.closest?.('.game-board-score') ?? null;
  if (!scoreEl) return;
  const state = gameBoardState.get(Number(scoreEl.closest('.modal').id.replace('game-board-', '')));
  if (state) state._touch = e.changedTouches[0].clientY;
}, {passive: true});

document.addEventListener('touchend', (e) => {
  const scoreEl = e.target.closest?.('.game-board-score') ?? null;
  if (!scoreEl) return;
  const state = gameBoardState.get(Number(scoreEl.closest('.modal').id.replace('game-board-', '')));
  if (!state || state._touch === null) return;
  const dy = e.changedTouches[0].clientY - state._touch;
  state._touch = null;
  if (Math.abs(dy) < 30) return; // не свайп: тап обрабатывает click
  e.preventDefault(); // гасим синтетический click, иначе очко задвоится
  gameBoardScore(scoreEl, dy < 0);
}, {passive: false});

$(document).on('click', '.game-board-score', function () {
  gameBoardScore(this, true);
});

// свап чётности пары (общий для десктоп-клика и мобильного свайпа):
// игроки пары меняются кортами, подача (кто подаёт) не меняется
const swapPlayerParity = (playerEl) => {
  const matchId = Number(playerEl.closest('.modal').id.replace('game-board-', ''));
  const team = playerEl.closest('.game-board-col')?.querySelector('.game-board-score')?.getAttribute('data-team-number');
  if (!team) return;
  $.post(`/api/games/current/swap?match_id=${matchId}&team_number=${team}`,
      result => {
        const state = gameBoardState.get(matchId);
        if (!state) return;
        if (result.even_1_user_id !== undefined) state.even_1_user_id = result.even_1_user_id;
        if (result.even_2_user_id !== undefined) state.even_2_user_id = result.even_2_user_id;
        // подача пары при свапе переезжает на корт по чётности счёта —
        // сервер пересчитал, маркер должен уехать вместе с ней
        if (result.serve_user_id !== undefined) state.serve_user_id = result.serve_user_id;
        renderGameBoard(matchId, result.score_1, result.score_2);
        navigator.vibrate?.(30);
        boardBeep(440, 0.08, 0.15);
      });
};

// подача на 0:0 первой игры (общая часть мобильного тапа): только чётному
// игроку, только пока записанных игр нет; сервер валидирует повторно
const servePlayerTap = (state, playerEl, matchId) => {
  if (document.body.dataset.tournamentType !== '1') return;
  if (!playerEl.querySelector('.board-parity-even')) return; // только чётному
  const modal = playerEl.closest('.modal');
  const scores = [...modal.querySelectorAll('.game-board-score')].map(el => Number(el.textContent));
  if (scores.some(s => s !== 0)) return; // только 0:0
  if ((state.wins_1 ?? 0) + (state.wins_2 ?? 0) > 0) return; // только первая игра
  const userId = Number(playerEl.getAttribute('data-user-id'));
  $.post(`/api/games/current/serve?match_id=${matchId}&user_id=${userId}`, result => {
    if (!result) return;
    state.serve_user_id = result.serve_user_id ?? null;
    state.even_1_user_id = result.even_1_user_id ?? null;
    state.even_2_user_id = result.even_2_user_id ?? null;
    renderGameBoard(matchId, result.score_1, result.score_2);
  });
};

// тач-жесты по игроку (мобайл): свайп к напарнику — свап чётности,
// тап — подача (только чётному в первой игре). preventDefault гасит
// синтетические click/dblclick, чтобы тап не сработал как десктопный
document.addEventListener('touchstart', (e) => {
  const playerEl = e.target.closest?.('.board-player') ?? null;
  if (!playerEl) return;
  const state = gameBoardState.get(Number(playerEl.closest('.modal').id.replace('game-board-', '')));
  if (state) state._playerTouch = e.changedTouches[0].clientY;
}, {passive: true});

document.addEventListener('touchend', (e) => {
  const playerEl = e.target.closest?.('.board-player') ?? null;
  if (!playerEl) return;
  const matchId = Number(playerEl.closest('.modal').id.replace('game-board-', ''));
  const state = gameBoardState.get(matchId);
  if (!state || state._playerTouch === null) return;
  const dy = e.changedTouches[0].clientY - state._playerTouch;
  state._playerTouch = null;
  e.preventDefault();
  if (Math.abs(dy) < 30) {
    // тап — подача (условия внутри: чётный, 0:0, первая игра)
    state._tapHandled = Date.now(); // страховка: если preventDefault не погасил click
    servePlayerTap(state, playerEl, matchId);
    return;
  }
  // направление «к напарнику»: первый в паре — вниз, второй — вверх
  const playersInPair = [...playerEl.closest('.game-board-players').querySelectorAll('.board-player')];
  const towardPartner = playersInPair.indexOf(playerEl) === 0 ? dy > 0 : dy < 0;
  if (!towardPartner) return;
  swapPlayerParity(playerEl);
}, {passive: false});

// десктоп: клик по игроку — свап чётности. Откладывается на 250мс и
// отменяется dblclick'ом — двойной клик означает подачу, а не два свапа
let playerClickTimer = null;
$(document).on('click', '.game-board-modal .board-player', function () {
  if (document.body.dataset.tournamentType !== '1') return;
  const matchId = Number(this.closest('.modal').id.replace('game-board-', ''));
  const state = gameBoardState.get(matchId);
  if (!state) return;
  if (state._tapHandled && Date.now() - state._tapHandled < 500) return; // мобильный тап
  if (playerClickTimer !== null) return; // второй клик даблклика
  const el = this;
  playerClickTimer = setTimeout(() => {
    playerClickTimer = null;
    swapPlayerParity(el);
  }, 250);
});

// открытие табло: модалка создаётся один раз на матч вне #game-block
// (renderGames пересоздаёт game-block каждые 30с — вне его модалка
// переживает перерисовку) и показывается; при показе — текущий счёт с
// сервера: игру могут продолжить с другого устройства, счёт в БД
// (промежуточный результат сохраняется на сервере при каждом очке)
$(document).on('click', '.game-form-button-board', async function () {
  const counter = Number(this.id.replace('game-form-button-board-', ''));
  const match = unfinishedMatches[counter];
  if (!match) return;
  const matchId = Number(match.id);
  if (!$(`#game-board-${matchId}`).length) {
    $(gameBoardTemplate(matchId)).appendTo(document.body);
  }
  let state = gameBoardState.get(matchId);
  if (!state) {
    // game_point (порог половинного свапа решающей игры) — настройка турнира
    const gamePoint = Number(await $.get(withTournament('/api/settings/game_point')));
    state = {match, swapped: false, halfSwapped: false, game_point: gamePoint, _touch: null, _playerTouch: null};
    gameBoardState.set(matchId, state);
  } else {
    state.match = match;
  }
  const modalEl = $(`#game-board-${matchId}`)[0];
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
});

// подача на 0:0: двойной клик по игроку (аватар + ФИО) — задать первого
// подающего матча. Только Новая лига (tournament_type = 1), только чётному
// игроку и только в первой игре матча (0:0); сервер валидирует повторно.
// Отменяет отложенный клик-свап — двойной клик не должен свапать
$(document).on('dblclick', '.game-board-modal .board-player', function () {
  if (playerClickTimer !== null) {
    clearTimeout(playerClickTimer);
    playerClickTimer = null;
  }
  if (document.body.dataset.tournamentType !== '1') return;
  const modal = this.closest('.modal');
  const matchId = Number(modal.id.replace('game-board-', ''));
  const state = gameBoardState.get(matchId);
  if (!state) return;
  servePlayerTap(state, this, matchId);
});

// при показе — счёт с сервера (игра могла пойти с другого устройства,
// промежуточный результат уже в БД). Игры без очков сервер отдаёт
// пустым телом (promise-middleware шлёт null как '') — читаем текст
$(document).on('shown.bs.modal', '.game-board-modal', async event => {
  const matchId = Number(event.currentTarget.id.replace('game-board-', ''));
  const body = await fetch(`/api/games/current?match_id=${matchId}`).then(r => r.text());
  const current = body ? JSON.parse(body) : null;
  // подача и чётность кортов из текущей игры (может не быть — 0:0 до
  // первого очка: воланчик появится после двойного клика или первого очка)
  const state = gameBoardState.get(matchId);
  if (state && current) {
    state.serve_user_id = current.serve_user_id ?? null;
    state.even_1_user_id = current.even_1_user_id ?? null;
    state.even_2_user_id = current.even_2_user_id ?? null;
    state.wins_1 = current.wins_1 ?? 0;
    state.wins_2 = current.wins_2 ?? 0;
  }
  // сервер отдаёт игру с current = 1 либо null (табло показывает 0:0,
  // игра создаётся первым очком); номер игры — сколько записано + 1
  renderGameBoard(matchId, current?.score_1 ?? 0, current?.score_2 ?? 0,
      (current ? current.wins_1 + current.wins_2 : 0) + 1);
});

// ручная смена сторон при 0:0 (кнопка, как в 110): счёт идёт за командой,
// колонки меняются содержимым. Между играми и на половинном счёте
// решающей игры стороны меняет игра (gameBoardResult)
$(document).on('click', '.game-board-modal .board-swap', function () {
  const modal = this.closest('.modal');
  const matchId = Number(modal.id.replace('game-board-', ''));
  const state = gameBoardState.get(matchId);
  if (!state) return;
  state.swapped = !state.swapped;
  // счёт возьмём из колонок: рендер перечитает его по data-team-number
  const scores = [...modal.querySelectorAll('.game-board-score')].reduce((acc, el) => {
    acc[el.getAttribute('data-team-number')] = Number(el.textContent);
    return acc;
  }, {});
  renderGameBoard(matchId, scores[1], scores[2]);
});

// принудительный альбом табло на телефоне — как у табло 110
// (group.js): fullscreen + lock('landscape'), где недоступно — CSS
$(document).on('shown.bs.modal', '.game-board-modal', async event => {
  if (!document.body.classList.contains('phone')) return;
  try {
    await event.currentTarget.requestFullscreen?.();
    await screen.orientation?.lock?.('landscape');
  } catch {
    // iOS: нативный lock недоступен — табло доворачивает CSS (index.css)
  }
});
