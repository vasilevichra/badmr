$(document).ready(() => {

  // скрытие блоков после перезагрузки страницы или логина
  $('.closable').each((i, el) => {
    if ($.cookie($(el).attr('id')) === 'false') {
      toggler.hide($(el));
    }
  });

  // турнир стартовал (статус 2 «Идёт» и дальше): один раз за турнир сворачиваем
  // шапку, информацию о турнире и все разделы, кроме «Подбор» и «Игры» —
  // у них нет шеврона. Маркер-cookie гарантирует «один раз» и не даёт
  // перекрыть последующие раскрытия пользователя (и его выбор до старта)
  if (tournamentStatus() !== undefined && tournamentStatus() !== 1) {
    const collapsedMarker = `collapsed-at-start-${tournamentId()}`;
    if ($.cookie(collapsedMarker) === undefined) {
      $.cookie(collapsedMarker, true);
      $('.closable').each((i, el) => toggler.hide($(el)));
    }
  }

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
      matchesTarget: values.matches,
    });
  });
  renderSelect();
  renderGames();
  renderCourts();
  renderTournaments();
  renderSettings();
  renderArchive();
  renderGroups();
  drawGroupsDiagonal();
  renderTournamentProgress();

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

  // заполнение «N назад» и красного бейджа телефона на клиенте:
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
        deletedUnfinished.add(Number(id)); // исчезновение из списка — не завершение
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

  // обработчики событий для табло (свайп вверх по счёту — +1 очко)
  addScoreBoardHandlers();

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

    // ФИО в шапке карточки под логином редактируется по клику: Enter или
    // смена фокуса — сохранить, Esc — отмена. Содержимое карточки
    // подгружается ajax'ом, поэтому делегирование — на постоянной
    // оболочке #player-window
    $('#player-window').on('click', '.player-window-name', function () {
      const header = $(this);
      if (header.find('input').length) return;
      const original = header.text().trim();
      header.data('original', original)
          .removeData('cancelled')
          .html($('<input>', {type: 'text', class: 'form-control form-control-sm', value: original}));
      const input = header.find('input').get(0);
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });

    // Esc запоминается на заголовке (input при закрытии теряет .data),
    // чтобы нативный blur вслед за jQuery-триггером не сохранил правку
    $('#player-window').on('keydown', '.player-window-name input', function (event) {
      if (event.key === 'Escape') {
        $(this).closest('.player-window-name').data('cancelled', true);
        $(this).trigger('blur');
      } else if (event.key === 'Enter') {
        event.preventDefault();
        $(this).trigger('blur');
      }
    });

    $('#player-window').on('blur', '.player-window-name input', function () {
      const input = $(this);
      const header = input.closest('.player-window-name');
      // blur срабатывает и от jQuery-триггера, и нативно вслед за ним;
      // после первого закрытия ввода input уже отвязан — это повтор
      if (!header.length) return;
      const cancelled = header.data('cancelled');
      const original = String(header.data('original'));
      const name = String(input.val()).trim();
      // ввод закрывается сразу: неуспешный POST вернёт старое имя
      header.text(original).removeData('cancelled');
      if (cancelled || !name || name === original) return;
      $.post(`/api/users/name/${header.data('user-id')}`, {name: name})
          .done(() => {
            header.text(name);
            refresh.table.player();
          })
          .fail(() => header.text(original));
    });

    // дата рождения в карточке редактируется по клику так же, как ФИО:
    // Enter или смена фокуса — сохранить, Esc — отмена. Нативный
    // input[type=date] гарантирует формат ГГГГ-ММ-ДД; после сохранения
    // карточка перезагружается — возраст пересчитывается на сервере
    $('#player-window').on('click', '.player-window-birthday', function () {
      const field = $(this);
      if (field.find('input').length) return;
      const original = field.data('original-text') ?? field.text().trim();
      field.data('original-text', original)
          .removeData('cancelled')
          .html($('<input>', {type: 'date', class: 'form-control form-control-sm', value: $(this).data('birthday')}));
      const input = field.find('input').get(0);
      input.focus();
    });

    $('#player-window').on('keydown', '.player-window-birthday input', function (event) {
      if (event.key === 'Escape') {
        $(this).closest('.player-window-birthday').data('cancelled', true);
        $(this).trigger('blur');
      } else if (event.key === 'Enter') {
        event.preventDefault();
        $(this).trigger('blur');
      }
    });

    $('#player-window').on('blur', '.player-window-birthday input', function () {
      const input = $(this);
      const field = input.closest('.player-window-birthday');
      if (!field.length) return;
      const cancelled = field.data('cancelled');
      const original = String(field.data('original-text'));
      const birthday = String(input.val());
      field.text(original).removeData('cancelled').removeData('original-text');
      if (cancelled || !birthday) return;
      const userId = field.data('user-id');
      $.post(`/api/users/birthday/${userId}`, {birthday: birthday})
          .done(() => openPlayerWindow(userId))
          .fail(() => field.text(original));
    });

  }

  // название турнира в шапке (hero) редактируется по клику под админом:
  // Enter или смена фокуса — сохранить, Esc — отмена; класс
  // tournament-hero-name-edit присутствует в разметке только у залогиненного.
  // Вне if ($('#player-window').length): модалка игрока есть не во всех
  // вёрстках (нет на странице 110), а название редактируется везде
  $('.tournament-hero-name-edit').on('click', function () {
    const field = $(this);
    if (field.find('input').length) return;
    const original = field.text().trim();
    field.data('original', original)
        .removeData('cancelled')
        .text('')
        .append($('<input>', {type: 'text', class: 'form-control form-control-sm', value: original}));
    const input = field.find('input').get(0);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  $('.tournament-hero-name-edit').on('keydown', 'input', function (event) {
    if (event.key === 'Escape') {
      $(this).closest('.tournament-hero-name-edit').data('cancelled', true);
      $(this).trigger('blur');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      $(this).trigger('blur');
    }
  });

  $('.tournament-hero-name-edit').on('blur', 'input', function () {
    const input = $(this);
    const field = input.closest('.tournament-hero-name-edit');
    const cancelled = field.data('cancelled');
    const original = String(field.data('original'));
    const name = String(input.val()).trim();
    field.text(original).removeData('cancelled');
    if (cancelled || !name || name === original) return;
    $.post(`/api/tournaments/name/${tournamentId()}`, {name: name})
        .done(() => field.text(name))
        .fail(() => field.text(original));
  });

  // закрытие открытого модального окна по Esc (дублирует встроенное поведение
  // Bootstrap: работает и для модалок, созданных без фокуса внутри окна)
  $(document).on('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal.show').forEach((el) => {
        bootstrap.Modal.getInstance(el)?.hide();
      });
    }
  });

  // попап выбора турнира (#55, макет E): кнопка «🏆 #N» в шапке открывает
  // плитки турниров с сегментами Все/Идёт/Заверш.; клик по плитке — /t/:id.
  // Попап переносится в body: .header-card режет absolute-детей через
  // overflow: hidden; позицию на десктопе считает JS от кнопки, на телефоне
  // (body.phone) шторку снизу ставит CSS
  const switchWrap = $('#tournament-switch');
  if (switchWrap.length) {
    const popup = $('#tournament-popup').appendTo('body');
    const switchBtn = $('#tournament-switch-btn');
    const closePopup = () => {
      popup.attr('hidden', true);
      switchBtn.attr('aria-expanded', 'false');
    };
    switchBtn.on('click', (e) => {
      e.stopPropagation();
      if (popup.attr('hidden') === undefined) {
        closePopup();
        return;
      }
      if (document.body.classList.contains('phone')) {
        // шторку снизу ставит CSS — инлайн от десктопного открытия мешает
        popup.css({top: '', right: ''});
      } else {
        const rect = switchBtn[0].getBoundingClientRect();
        popup.css({top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right)});
        popup.removeAttr('hidden');
        // правое краевое позиционирование тянет попап влево от кнопки;
        // если он вылез за левый край (кнопка у левого края окна) —
        // раскрываем в другую сторону: левый край от кнопки, но не дальше
        // 8px от правого края вьюпорта
        if (popup[0].getBoundingClientRect().left < 8) {
          popup.css({right: '', left: Math.min(rect.left, window.innerWidth - popup[0].offsetWidth - 8)});
        }
        switchBtn.attr('aria-expanded', 'true');
        return;
      }
      popup.removeAttr('hidden');
      switchBtn.attr('aria-expanded', 'true');
    });
    $(document).on('click', (e) => {
      if (!$(e.target).closest('#tournament-switch').length && !$(e.target).closest('#tournament-popup').length) closePopup();
    });
    // fixed-попап не ездит вместе со страницей — при скролле/ресайзе закрываем
    $(window).on('scroll resize', () => {
      if (popup.attr('hidden') === undefined) closePopup();
    });
    popup.find('.tournament-popup-seg button').on('click', function () {
      popup.find('.tournament-popup-seg button').removeClass('on');
      $(this).addClass('on');
      const filter = $(this).data('filter');
      popup.find('.tournament-tile').each((i, el) => {
        $(el).toggleClass('d-none', filter !== 'all' && $(el).data('group') !== filter);
      });
    });
    popup.find('.tournament-tile').on('click keydown', (e) => {
      if (e.type === 'click' || e.key === 'Enter' || e.key === ' ') {
        const goto = $(e.currentTarget).data('goto');
        if (goto) location.href = goto;
      }
    });
  }
});

// тонкий прогресс-бар турнира (между «Игроками» и «Подбором»): доля сыгранных
// матчей от примерного общего числа. Остаток ограничен тем, чтобы каждый
// невыключенный (enabled) игрок сыграл минимум matches из настроек:
//   нужно матчей ≈ ceil(Σ max(0, matches − сыграно_игроком) / 4)
// незавершённые матчи не считаются сыгранными — их участники исключаются и
// из «сыграно», и из остатка; вызывается при загрузке страницы, при первом
// «Начать» в Подборе (select.js, с принудительным показом) и после
// сохранения результатов матча (game.js)
const renderTournamentProgress = (force = false) => {
  if (!$('#tournament-progress').length) return;
  Promise.all([
    $.getJSON(withTournament('/api/users/')),
    $.getJSON(withTournament('/api/settings/')),
    $.getJSON(withTournament('/api/matches/unfinished')),
  ]).then(([rows, settingRows, unfinished]) => {
    const matchesTarget = Number(settingRows.find((row) => row.name === 'matches')?.value ?? 0);
    const unfinishedByUser = {};
    for (const match of unfinished) {
      for (const i of [1, 2, 3, 4]) {
        unfinishedByUser[match[`user_${i}_id`]] = (unfinishedByUser[match[`user_${i}_id`]] ?? 0) + 1;
      }
    }
    // каждый матч играют ровно 4 игрока: сумма matches по всем игрокам
    // (включая выключенных) — это 4 × сыгранные матчи
    const playedTotal = Math.max(0, (rows.reduce((sum, p) => sum + p.matches, 0) - 4 * unfinished.length) / 4);
    const remaining = rows.filter((p) => p.enabled)
    .reduce((sum, p) => sum + Math.max(0, matchesTarget - (p.matches - (unfinishedByUser[p.id] ?? 0))), 0);
    const neededTotal = Math.ceil(remaining / 4);
    const total = playedTotal + neededTotal;
    // без матчей бар показываем только по принудительному показу (первое «Начать»)
    if (!playedTotal && !unfinished.length && !force) return;
    const percent = total ? Math.round(100 * playedTotal / total) : 0;
    $('#tournament-progress').removeClass('d-none')
    .attr('title', `Сыграно примерно ${playedTotal} из ${total} матчей`)
    .find('.progress-bar')
    .css('width', `${percent}%`)
    .attr('aria-valuenow', percent);
  });
};
