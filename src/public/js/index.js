$(document).ready(() => {

  // скрытие блоков после перезагрузки страницы или логина
  $('.closable').each((i, el) => {
    if ($.cookie($(el).attr('id')) === 'false') {
      toggler.hide($(el));
    }
  });

  // настройка обратного отсчёта для информации о турнире
  // (не трогаем <time> с «закончилась N назад» — там свой формат datetime)
  $('time').not('.reg-end-since, .reg-end-since-badge')
  .countDown({label_dd: 'д', label_hh: 'ч', label_mm: 'м', separator_days: ' ', with_hh_leading_zero: false, with_seconds: false});

  // подстановка значения в строку поиска для регистрации
  $('.tournament-new-registration-input').val($.cookie('registration-input')).trigger('input');

  // window.onbeforeunload = () => 'Are you sure you want to leave?';

  // настройки и статусы турнира загружаются одним асинхронным пакетом
  // (раньше — 11 блокирующих синхронных запросов при каждой загрузке)
  Promise.all([
    $.getJSON(withTournament('/api/settings/')),
    $.getJSON(withTournament('/api/tournaments/paid/')),
    $.getJSON(withTournament('/api/tournaments/played/')),
  ]).then(([settingRows, paid, played]) => {
    const values = {};
    settingRows.forEach((row) => values[row.name] = Number(row.value));

    renderPlayers({
      B_max: values.B_max,
      C_max: values.C_max,
      D_max: values.D_max,
      E_max: values.E_max,
      F_max: values.F_max,
      G_max: values.G_max,
      H_max: values.H_max,
      calibrationMatches: values.calibration_matches,
      hasGames: Boolean(played),
      everybodyPaid: Boolean(paid),
    });
  });
  renderSelect();
  renderGames();
  renderCourts();
  renderTournaments();
  renderSettings();
  renderArchive();
  renderGroups();

  // периодический тик: только перерисовка блока игр и пересчёт «закончилась
  // N назад» — таблицы и историю игрок обновляет вручную (периодический
  // refresh затирал режим редактирования истории и дёргал сервер зря)
  setInterval(() => {
    // блок игр перерисовывается целиком из данных сервера
    if ($('#game').find('input:focus, select:focus').length === 0) {
      renderGames();
    }
    fillRegEndSince();
  }, 30000);

  // заполнение «закончилась N назад» и красного бейджа телефона на клиенте:
  // при рендере страницы строка всегда устаревает, клиентский пересчёт
  // этого не допускает
  const fillRegEndSince = () => {
    $('.reg-end-since').each((i, el) => {
      const parts = calendarPartsSince($(el).attr('datetime'));
      $(el).text(parts.length ? `${parts.join(' ')} назад` : 'сегодня');
    });
    $('.reg-end-since-badge').each((i, el) => {
      $(el).text(sinceCompact($(el).attr('datetime')) || 'сегодня');
    });
  };
  fillRegEndSince();

  // выравнивание перелистывания страниц по центру для всех таблиц
  $('.fixed-table-pagination').addClass('d-flex justify-content-center');

  // тогглеры блоков доступны с клавиатуры: Enter/Space переключают блок
  $(document).on('keydown', '.toggler', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggler.toggle(this);
    }
  });

  // удаление матча из истории (иконка корзины у карточки матча,
  // только для авторизованных): после удаления матч исчезает из истории,
  // а игроки возвращаются в подбор
  $(document).on('click', '.match-history-delete', function () {
    const id = $(this).data('id');
    const index = $(this).data('index');
    confirmAction(`Удалить матч №${index}?`, () => {
      $.post(`/api/matches/delete/${id}`, {}, () => {
        refresh.block.by.id('match-history-block');
        refresh.table.player();
        refresh.table.court();
      });
    });
  });

  // ----- редактирование матча из истории (карандаш) -----
  // счёт выигравшей пары по правилам бадминтона (те же CASE-выражения,
  // что в getMedianSecondsPerPoint): до game_point−2 — game_point,
  // до max_point−2 — lost+2, дальше — max_point
  const matchHistoryWinPoints = (lost, gamePoint, maxPoint) =>
      lost < gamePoint - 1 ? gamePoint : (lost < maxPoint - 1 ? lost + 2 : maxPoint);

  // счёт игр карточки: по колонкам — id игры (если есть), исходные и
  // текущие значения обеих пар
  const matchHistoryColumns = ($table) => {
    const gamePoint = Number($table.data('game-point'));
    const maxPoint = Number($table.data('max-point'));
    const $row1 = $table.find('tr:eq(1)');
    const $row2 = $table.find('tr:eq(4)');
    return $row1.find('td.match-history-game-col').map((i, el) => {
      const $c1 = $(el);
      const $c2 = $row2.find('td.match-history-game-col').eq(i);
      const value = ($c) => {
        const v = $c.find('input').val();
        return v === '' || v === undefined ? null : Number(v);
      };
      return {
        id: $c1.data('game-id'),
        v1: value($c1), v2: value($c2),
        orig1: Number($c1.data('original')), orig2: Number($c2.data('original')),
        $c1, $c2, gamePoint, maxPoint,
      };
    }).get();
  };

  // колонка валидна: пустая (удаление существующей) или полный счёт,
  // где больший равен счёту победителя по формуле
  const matchHistoryColumnValid = (c) => {
    if (c.v1 === null && c.v2 === null) return true;
    if (c.v1 === null || c.v2 === null) return false;
    return c.v1 === matchHistoryWinPoints(c.v2, c.gamePoint, c.maxPoint)
        || c.v2 === matchHistoryWinPoints(c.v1, c.gamePoint, c.maxPoint);
  };

  // галочка активна только при реальных изменениях и валидном счёте
  const matchHistoryUpdateCheck = ($table) => {
    const columns = matchHistoryColumns($table);
    const changed = columns.some(c => c.v1 !== c.orig1 || c.v2 !== c.orig2);
    columns.forEach(c => {
      const valid = matchHistoryColumnValid(c);
      c.$c1.find('input').toggleClass('is-invalid', !valid);
      c.$c2.find('input').toggleClass('is-invalid', !valid);
    });
    $table.find('.match-history-check').toggleClass('disabled-check', !(changed && columns.every(matchHistoryColumnValid)));
  };

  const matchHistoryInput = (value) =>
      `<input type="number" inputmode="numeric" min="0" class="match-history-score-input form-control form-control-sm" value="${value ?? ''}">`;

  // карандаш: счёт игр становится редактируемым, при недоборе до максимума
  // добавляются пустые колонки; карандаш → галочка, корзина → крестик
  $(document).on('click', '.match-history-edit', function () {
    const $table = $(this).closest('table.match-history-players');
    if ($table.data('editing')) return;
    $table.data('original', $table.clone(true, true));
    $table.data('editing', true);

    const gamesMax = Number($table.data('games-max'));
    const $rows = $table.find('tbody tr');
    const $scores1 = $rows.eq(1).find('td.match-history-game-col');
    const count = $scores1.length;

    // существующие ячейки → инпуты
    [$rows.eq(1), $rows.eq(4)].forEach($row => {
      $row.find('td.match-history-game-col').each(function () {
        const $cell = $(this);
        $cell.html(matchHistoryInput($cell.data('original')));
      });
    });

    // новые колонки до максимума: colspan строк дельты/〈Σ〉, инпуты,
    // длительности «—»
    for (let i = count; i < gamesMax; i++) {
      $rows.eq(0).find('.match-history-actions-cell').attr('colspan', i + 1);
      $rows.eq(6).find('.match-history-empty-col').attr('colspan', i + 1);
      $rows.eq(1).append(`<td rowspan="2" class="match-history-game-col match-history-score">${matchHistoryInput(null)}</td>`);
      $rows.eq(4).append(`<td rowspan="2" class="match-history-game-col match-history-score">${matchHistoryInput(null)}</td>`);
      $rows.eq(3).append('<td class="match-history-game-col">—</td>');
    }

    // карандаш → галочка (Подтвердить, неактивна без изменений),
    // корзина → крестик (Отменить); те же размеры и opacity
    $(this).removeClass('bi-pencil match-history-edit')
        .addClass('bi-check match-history-check disabled-check')
        .attr('title', 'Подтвердить');
    $table.find('.match-history-delete').removeClass('bi-trash3 match-history-delete')
        .addClass('bi-x match-history-cancel')
        .attr('title', 'Отменить');
  });

  // крестик: откат к исходному виду без запросов
  $(document).on('click', '.match-history-cancel', function () {
    const $table = $(this).closest('table.match-history-players');
    const $original = $table.data('original');
    if ($original) $table.replaceWith($original);
  });

  // активность галочки пересматривается на каждый ввод
  $(document).on('input', '.match-history-players .match-history-score-input', function () {
    matchHistoryUpdateCheck($(this).closest('table.match-history-players'));
  });

  // Enter в инпуте — подтвердить, Escape — отменить
  $(document).on('keydown', '.match-history-players .match-history-score-input', function (event) {
    const $table = $(this).closest('table.match-history-players');
    if (event.key === 'Enter') $table.find('.match-history-check').trigger('click');
    if (event.key === 'Escape') $table.find('.match-history-cancel').trigger('click');
  });

  // галочка: изменённые игры переписываются, новые создаются
  // (время экстраполируется на сервере), пустые колонки исчезают;
  // очищенный счёт существующей игры удаляет игру; пересчёт рейтинга —
  // один каскад на сервере
  $(document).on('click', '.match-history-check', function () {
    if ($(this).hasClass('disabled-check')) return;
    const $table = $(this).closest('table.match-history-players');
    const matchId = $table.data('match-id');
    // raw-значения: в БД хранится только счёт проигравшей пары
    const raw = (c) => {
      if (c.v1 === null && c.v2 === null) return {lost_1_by: null, lost_2_by: null};
      if (c.v1 > c.v2) return {lost_1_by: null, lost_2_by: c.v2};
      return {lost_1_by: c.v1, lost_2_by: null};
    };
    const games = matchHistoryColumns($table).map(c => c.id
        ? {id: c.id, ...raw(c)}
        : (c.v1 !== null && c.v2 !== null ? raw(c) : null)).filter(Boolean);

    $.post(`/api/games/bulk/${matchId}`, {games: JSON.stringify(games)}, () => {
      const $block = $table.closest('div[id$="match-history-block"]');
      if ($block.length) $block.load(location.href + ` #${$block.attr('id')}>*`, '');
      refresh.table.player();
      refresh.table.court();
    });
  });
  // ----- конец редактирования матча -----

  // обработчики событий для табло
  ["board-score-l", "board-score-r"].map(id => document.getElementById(id)).map(el => addScoreBoardHandlers(el));

  // модалка игрока привязана к адресу (?player=<id>):
  // по ссылке открываем модалку, назад/вперёд открывают/закрывают её,
  // закрытие модалки убирает её параметры из адреса
  if ($('#player-window').length) {
    const playerParam = () => new URLSearchParams(location.search).get('player');

    if (playerParam()) {
      openPlayerWindow(playerParam());
    }

    window.addEventListener('popstate', () => {
      const id = playerParam();
      if (id) {
        openPlayerWindow(id);
      } else {
        bootstrap.Modal.getInstance($('#player-window')[0])?.hide();
      }
    });

    // при закрытии карточки из адреса уходит всё, что к ней относится:
    // ?player=<id>, ?tab=<имя> и ?all=1 (id.ejs синхронизирует их с адресом)
    $('#player-window').on('hidden.bs.modal', () => {
      if (playerParam()) {
        const url = new URL(location.href);
        ['player', 'tab', 'all'].forEach((name) => url.searchParams.delete(name));
        history.replaceState({}, '', url);
      }
    });

    // клик по игроку в «Достижениях» и «Истории матчей» (на странице и в
    // карточке игрока) открывает модалку игрока; для карточки игрока
    // делегирование — на постоянной оболочке #player-window: её содержимое
    // подгружается ajax'ом, и на момент привязки #player-match-history-block
    // ещё не существует
    $('#achievement-block, #match-history-block, #player-window').on('click', '.achievement-player, .match-history-players-name, .co-player', function () {
      openPlayerWindow(Number($(this).data('user-id')));
    });
  }

  // закрытие открытого модального окна по Esc (дублирует встроенное поведение
  // Bootstrap: работает и для модалок, созданных без фокуса внутри окна)
  $(document).on('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal.show').forEach((el) => {
        bootstrap.Modal.getInstance(el)?.hide();
      });
    }
  });
});
