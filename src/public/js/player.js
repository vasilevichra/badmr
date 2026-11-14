// контекст приходит из index.js асинхронно: лимиты групп рейтинга из
// настройки и флаги состояния турнира — синхронные запросы здесь запрещены

// день рождения на текущей неделе: месяц-день рождения совпадает с одним
// из дней календарной недели (Пн–Вс) в часовом поясе браузера — у клуба
// и игроков он один; год не сравнивается (#54)
const isBirthdayThisWeek = (birthday) => {
  if (!birthday) {
    return false;
  }
  const [, month, day] = birthday.split('-').map(Number);
  const now = new Date();
  // начало календарной недели — понедельник
  const monday = new Date(now);
  monday.setDate(now.getDate() - (now.getDay() + 6) % 7);
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + offset);
    if (d.getMonth() + 1 === month && d.getDate() === day) {
      return true;
    }
  }
  return false;
};

const renderPlayers = ({B_max, C_max, D_max, E_max, F_max, G_max, H_max, calibrationMatches, hasGames, everybodyPaid, matchesTarget}) => {
  $('#player-table')
  .bootstrapTable({
    url: withTournament('/api/users/'),
    search: loggedInUser && isNotPhone(),
    sortName: hasGames ? 'delta_today' : 'rating',
    sortOrder: 'desc',
    /*pagination: true, pageSize: 20, pageNumber: 1,*/
    showRefresh: loggedInUser && isNotPhone(),
    undefinedText: '<math><mo>&minus;</mo></math>',
    onPostBody: () => {
      // если содержимое ячейки имени не вмещается (длинное ФИО), бар
      // калибровки прячем — имя важнее; перепроверяется после каждой
      // перерисовки тела таблицы (загрузка, сортировка, поиск)
      document.querySelectorAll('#player-table .player-name-cell').forEach(cell => {
        const bar = cell.querySelector('.player-calibration-bar');
        if (bar) bar.classList.toggle('d-none', cell.scrollWidth - cell.clientWidth > 1);
      });
    },
    columns: [
      {
        field: '#',
        title: '<span class="no-selection">№</span>',
        align: 'center',
        formatter: (value, row, index) => index + 1,
      },
      {
        field: 'enabled',
        title: '<span class="no-selection">Доступен?</span>',
        visible: loggedInUser,
        checkbox: true,
        sortable: isNotPhone(),
        formatter: (value, row) => {
          if (row.occupied === 1) {
            return {
              disabled: true,
            };
          }
          return value;
        },
        cellStyle: (value, row) => row.occupied === 0 || {css: {"background-color": "rgba(143,237,100,0.13)"}},
        class: isPhone() ? 'p-0' : '',
      },
      {
        field: 'name',
        title: '<span class="no-selection">Имя</span>',
        sortable: true,
        formatter: (value, row) => {
            // индикация калибровки рейтинга: мини-бар в стиле «Сыграно»,
            // работает на убывание — заливка показывает, сколько матчей
            // серии осталось. Красный — начало (до 1/3 сыграно), жёлтый —
            // середина (1/3–2/3), зелёный — конец серии (от 2/3);
            // после последнего матча серии бар исчезает.
            // У завершённого турнира бара нет — калибровка по законченным
            // матчам уже не актуальна (#53)
            const bar = row.calibrating && row.calibration_series < calibrationMatches && tournamentStatus() !== 3
                ? '<span class="player-matches-bar player-calibration-bar player-calibration-' +
                  (row.calibration_series === 0 || calibrationMatches <= 0 || row.calibration_series / calibrationMatches < 1 / 3
                      ? 'red'
                      : row.calibration_series / calibrationMatches < 2 / 3 ? 'yellow' : 'green') +
                  '" title="Калибровка рейтинга (' + row.calibration_series + ' из ' + calibrationMatches + ')"><i style="width:' +
                  (calibrationMatches > 0 ? Math.min(100, Math.round(100 * (calibrationMatches - row.calibration_series) / calibrationMatches)) : 0) +
                  '%"></i></span>'
                : '';
            // всё содержимое ячейки — в одном флекс-span (.player-name-cell):
            // бар калибровки прижимается margin-left:auto к правому краю
            // колонки «Имя», за ним тортик; кнопки настроек — в контейнере
            // нулевой ширины, не влияют на ширину колонки, поверх неё
            // рисуются по нажатию «Настройки»
            return '<span class="player-name-cell">' +
                this.share.playerNameFormatter(row.id, value, row.sex, row.pic, isPhone()) +
                bar +
                // еле заметный тортик со свечами в самом конце колонки —
                // у того, чей день рождения на текущей неделе (#54)
                (isBirthdayThisWeek(row.birthday)
                    ? '<i class="bi bi-cake2 player-birthday" title="С днём рождения!"></i>'
                    : '') +
                '<span class="player-settings-buttons">' +
                '<button class="player-settings btn btn-outline-danger btn-xs mx-1' + (isPlayerSettingsOn() ? '' : ' d-none') + '" onclick="$.post(`/api/users/deregister/` + $(this).closest(`td`).find(`.user-id`).text()); event.stopPropagation(); refresh.table.player();"><i class="bi bi-trash3"></i> Удалить</button>' +
                '<button class="player-settings btn btn-outline-warning btn-xs' + (isPlayerSettingsOn() ? '' : ' d-none') + '" onclick="$.post(`/api/users/archive/` + $(this).closest(`td`).find(`.user-id`).text()); event.stopPropagation(); refresh.table.player(); refresh.table.archive();"><i class="bi bi-archive"></i> Архив</button>' +
                '</span>' +
                '</span>';
        },
        cellStyle: (value, row) => playerSexStyle(row.sex),
      },
      {
        field: 'paid',
        title: '<span class="no-selection">₽</span>',
        visible: loggedInUser && !everybodyPaid,
        formatter: (value, row) => row.paid ? `<i class="bi bi-check2"></i>` : `<i class="bi bi-dash-lg"></i>`,
        class: 'text-center paid-col',
      },
      {
        field: 'rating',
        title: isPhone() ? 'Р.' : '<span class="no-selection">Рейтинг</span>',
        align: 'center',
        sortable: true,
        class: 'player-num',
        formatter: (value, row) => playerRatingGroupsFormatter(row.rating, B_max, C_max, D_max, E_max, F_max, G_max, H_max),
        cellStyle: (value, row) => playerRatingGroupsStyle(row.rating, B_max, C_max, D_max, E_max, F_max, G_max, H_max),
      },
      {
        field: 'rating_lab',
        title: isPhone() ? 'Л.' : '<span class="no-selection">ЛАБ</span>',
        align: 'center',
        sortable: true,
        formatter: (value, row) => playerRatingGroupsFormatter(row.rating_lab, B_max, C_max, D_max, E_max, F_max, G_max, H_max),
        cellStyle: (value, row) => playerRatingGroupsStyle(row.rating_lab, B_max, C_max, D_max, E_max, F_max, G_max, H_max),
      },
      {
        field: 'delta_today',
        title: '<span class="no-selection">∆</span>',
        // title: '<span class="no-selection">Д</span>',
        visible: hasGames,
        align: 'center',
        sortable: true,
        class: 'player-num',
        formatter: value => value > 0 ? '+' + value : value,
        cellStyle: value => playerDeltaCss(value),
      },
      {
        visible: false,
        field: 'delta_week',
        title: '<span class="no-selection">Н</span>',
        align: 'center',
        sortable: true,
        formatter: value => value > 0 ? '+' + value : value,
        cellStyle: value => playerDeltaCss(value),
      },
      {
        visible: false,
        field: 'delta_month',
        title: '<span class="no-selection">М</span>',
        align: 'center',
        sortable: true,
        formatter: value => value > 0 ? '+' + value : value,
        cellStyle: value => playerDeltaCss(value),
      },
      {
        field: 'matches',
        title: '<span class="no-selection">Сыграно</span>',
        visible: hasGames,
        align: 'center',
        sortable: true,
        // при лимите матчей турнира (настройка «matches», 0 = ∞) — прогресс
        // к лимиту, как в макете E; без лимита — просто число
        formatter: matchesTarget > 0
          ? value => {
              const percent = Math.min(100, Math.round(100 * value / matchesTarget));
              return `<span class="player-matches-bar" title="Сыграно ${value} из ${matchesTarget} матчей">`
                  + `<i style="width:${percent}%"></i></span>${value}`;
            }
          : undefined,
      },
      {
        field: 'city',
        title: '<span class="no-selection">Город</span>',
        align: 'center',
        sortable: true,
      }
    ]
    .filter(column => loggedInUser ? true : !['enabled'].includes(column.field))
    .filter(column => isPhone() ? ['enabled', 'name', 'paid', 'rating', 'delta_today'].includes(column.field) : true)
  })
  // тело таблицы перерисовывается при каждой загрузке/сортировке —
  // перепроверяем умещение на экране после каждой перерисовки
  .on('post-body.bs.table', fitPlayerTable)
  .on('check-all.bs.table', (rowsAfter, rowsBefore) => {
    $.post(`/api/users/enable/${rowsBefore.map(r => r.id).join('%2C')}`, {}, () => {
      refresh.table.player();
      showSelectButton();
    });
  })
  .on('check.bs.table', (e, row, a) => {
    console.log(e);
    $.post(`/api/users/enable/${row.id}`, {}, () => {
      refresh.table.player();
      showSelectButton();
    });
  })
  .on('uncheck-all.bs.table', () => {
    const ids = $.map($('#player-table').bootstrapTable('getSelections'), row => row.id).join('%2C');
    $.post(`/api/users/disable/${ids}`, {}, () => refresh.table.player());

  })
  .on('uncheck.bs.table', (row, element) => {
    $.post(`/api/users/disable/${element.id}`, {}, () => refresh.table.player());
  })
  .on('click-cell.bs.table', (e, field, row, element) => {
    if (field === 'paid') {
      $.post(`/api/tournaments/pay/${element.id}?paid=${element.paid ? 0 : 1}`, {}, () => {
        refresh.table.player();
        // статус оплат перепроверяем асинхронно
        $.getJSON(withTournament('/api/tournaments/paid/'), (paid) => {
          if (paid) {
            new Promise(resolve => setTimeout(resolve, 3000)).then(() => hide.player.column.paid());
          }
        });
      });
    }
    if (field === 'name') {
      openPlayerWindow(element.id);
    }
  });

  if (loggedInUser) {
    // кнопки у таблицы игроков — разметка из <template id="player-toolbar-template"> (player-toolbar.ejs):
    $('.player .fixed-table-toolbar .columns').append($('#player-toolbar-template').html());
    $('#player-settings').off('click').click(() => {
      turnPlayerSettings(!isPlayerSettingsOn());
    });

    // краул ЛАБ — по требованию, при нажатии кнопки обновления таблицы
    // (штатная showRefresh bootstrap-table, других showRefresh в приложении нет).
    // Автозапуск при загрузке страницы убран: ответ данных не несёт (краул идёт
    // на сервере сам), таблицу не трогаем — иначе refresh абортит ещё летящий
    // запрос инициализации таблицы → ложное «нет связи с сервером»
    $(document).on('click', '.fixed-table-toolbar button[name="refresh"]', () => {
      $.ajax({
        url: '/api/users/lab',
        type: 'POST',
        cache: false,
        error: () => {
        },
      });
    });
  }
}

const playerDeltaCss = value => {
  if (value > 0) {
    return {classes: 'rating-plus'};
  }
  if (value < 0) {
    return {classes: 'rating-minus'};
  }
  return {};
}

// таблица «Игроки» на телефоне: паддинги рейтинга и дельты вдвое меньше
// исходных (.player-compact включает CSS), когда колонка оплаты видна —
// таблице теснее — или не умещается на экране без прокрутки; перепроверяем
// при перерисовке тела (post-body) и при изменении размеров экрана
const fitPlayerTable = () => {
  if (!isPhone()) {
    return;
  }
  const paidVisible = $('#player-table thead th[data-field="paid"]').is(':visible');
  const tight = document.body.scrollWidth > document.documentElement.clientWidth;
  $('#player-table').toggleClass('player-compact', paidVisible || tight);
};

$(window).off('resize.playerFit').on('resize.playerFit', fitPlayerTable);

const archiveUser = (id, name) => {
  if (confirm(`Сделать игрока ${name} неактивным?`)) {
    $.post(`/api/users/archive/${id}`, {}, () => {
      refresh.table.player();
      refresh.table.archive();
    });
  }
}

const unarchiveUser = (id, name) => {
  if (confirm(`Сделать игрока ${name} активным?`)) {
    $.post(`/api/users/unarchive/${id}`, {}, () => refresh.table.player());
  }
  refresh.table.archive();
}

const changeRating = (id, name, rating) => {
  if (confirm(`Изменить рейтинг игрока ${name} на ${rating}?`)) {
    $.post(`/api/users/rating/${id}?new=${rating}`, {}, () => refresh.table.player());
  }
}

const turnPlayerSettings = (state) => {
  $.cookie('player-settings', state);
  if (state) {
    $('.player-settings').each((i, el) => $(el).removeClass('d-none'));
  } else {
    $('.player-settings').each((i, el) => $(el).addClass('d-none'));
  }
}
const isPlayerSettingsOn = () => {
  return $.cookie('player-settings') === 'true';
}