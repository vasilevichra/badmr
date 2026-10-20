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
    $.getJSON('/api/settings/'),
    $.getJSON('/api/tournaments/paid/'),
    $.getJSON('/api/tournaments/played/'),
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

  // периодическое обновление данных зала: пока вкладка видима и в блоке
  // игр нет фокуса в полях ввода (иначе перезагрузка потеряла бы ввод)
  setInterval(() => {
    if (document.hidden) {
      return;
    }
    refresh.table.player();
    refresh.table.court();
    refresh.block.by.id('match-history-block');
    // блок игр перерисовывается целиком из данных сервера
    if ($('#game').find('input:focus, select:focus').length === 0) {
      renderGames();
    }
  }, 30000);

  // заполнение «закончилась N назад» на клиенте: при рендере страницы
  // строка всегда устаревает, клиентский пересчёт этого не допускает
  $('.reg-end-since').each((i, el) => {
    const parts = calendarPartsSince($(el).attr('datetime'));
    $(el).text(parts.length ? `${parts.join(' ')} назад` : 'сегодня');
  });
  $('.reg-end-since-badge').each((i, el) => {
    const parts = calendarPartsSince($(el).attr('datetime'));
    // компактный бейдж: только старшая единица (д/мес/г)
    const [num, unit] = parts.length ? parts[0].split(' ') : ['сегодня', ''];
    $(el).text(parts.length ? `${num}${unit.replace('.', '')}` : 'сегодня');
  });

  // выравнивание перелистывания страниц по центру для всех таблиц
  $('.fixed-table-pagination').addClass('d-flex justify-content-center');

  // тогглеры блоков доступны с клавиатуры: Enter/Space переключают блок
  $(document).on('keydown', '.toggler', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggler.toggle(this);
    }
  });

  // обработчики событий для табло
  ["board-score-l", "board-score-r"].map(id => document.getElementById(id)).map(el => addScoreBoardHandlers(el));

  // обновить рейтинг ЛАБ в фоне
  if (window.navigator.onLine) {
    $.ajax({
      url: '/api/users/lab',
      type: 'POST',
      cache: false,
      async: true,
      success: () => refresh.table.player(),
      error: () => {
      },
    });
  }

  // модалка игрока привязана к адресу (?player=<id>):
  // по ссылке открываем модалку, назад/вперёд открывают/закрывают её,
  // закрытие модалки убирает параметр из адреса
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

    $('#player-window').on('hidden.bs.modal', () => {
      if (playerParam()) {
        const url = new URL(location.href);
        url.searchParams.delete('player');
        history.replaceState({}, '', url);
      }
    });
  }
});
