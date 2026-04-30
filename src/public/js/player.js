const renderPlayers = (B_max, C_max, D_max, E_max, F_max, G_max, H_max) => {
  $('#player-table')
  .bootstrapTable({
    url: '/api/users/',
    search: loggedInUser && isNotPhone(),
    sortName: 'delta_month',
    sortOrder: 'desc',
    /*pagination: true, pageSize: 20, pageNumber: 1,*/
    showRefresh: loggedInUser && isNotPhone(),
    undefinedText: '<math><mo>&minus;</mo></math>',
    columns: [
      {
        field: '#',
        title: '<span class="no-selection">№</span>',
        align: 'center',
        formatter: (value, row, index) => index + 1,
      },
      {
        field: 'registered',
        title: '<span class="no-selection">Участвует?</span>',
        checkbox: true,
        sortable: true,
        cellStyle: (value, row) => row.enabled === 0 || {css: {"background-color": "rgba(143,237,100,0.13)"}},
      },
      {
        field: 'name',
        title: '<span class="no-selection">Имя</span>',
        sortable: true,
        formatter: (value, row) => this.share.playerNameFormatter(row.id, value, row.sex, row.pic, isPhone()),
        cellStyle: (value, row) => playerSexStyle(row.sex),
      },
      {
        field: 'rating',
        title: isPhone() ? 'Р.' : '<span class="no-selection">Рейтинг</span>',
        align: 'center',
        sortable: true,
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
        title: '<span class="no-selection">Д</span>',
        align: 'center',
        sortable: true,
        formatter: value => value > 0 ? '+' + value : value,
        cellStyle: value => playerDeltaCss(value),
      },
      {
        field: 'delta_week',
        title: '<span class="no-selection">Н</span>',
        align: 'center',
        sortable: true,
        formatter: value => value > 0 ? '+' + value : value,
        cellStyle: value => playerDeltaCss(value),
      },
      {
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
        align: 'center',
        sortable: true,
      },
      {
        field: 'city',
        title: '<span class="no-selection">Город</span>',
        align: 'center',
        sortable: true,
      }
    ]
    .filter(column => loggedInUser ? true : !['registered'].includes(column.field))
    .filter(column => isPhone() ? ['registered', 'name', 'rating'].includes(column.field) : true)
  })
  .on('check-all.bs.table', (rowsAfter, rowsBefore) => {
    $.post(`/api/users/register/${rowsBefore.map(r => r.id).join('%2C')}`);
    showSelectButton();
  })
  .on('check.bs.table', (row, element) => {
    $.post(`/api/users/register/${element.id}`);
    showSelectButton();
  })
  .on('uncheck-all.bs.table', (rowsAfter, rowsBefore) => {
    $.post(`/api/users/deregister/${rowsAfter.sender.options.data.map(r => r.id).join('%2C')}`);
  })
  .on('uncheck.bs.table', (row, element) => {
    $.post(`/api/users/deregister/${element.id}`);
  })
  .on('click-cell.bs.table', (field, value, row, element) => {
    if (value === 'name') {
      $.ajax({
            url: `/web/players/${element['id']}`,
            type: 'GET',
            cache: false,
            async: false,
            success: html => $("#player-window").html(html),
          }
      );
      new bootstrap.Modal('#player-window').show();

      $.ajax({
        type: 'GET',
        url: `/api/ratings/${element['id']}`,
        async: true,
        success: data => new Chart(document.getElementById('player-window-rating').getContext('2d'), {
          type: 'scatter',
          data: {
            datasets: [{
              label: 'Рейтинг',
              data: data,
              showLine: true,
              lineTension: 0.3,
              borderColor: 'rgb(13, 110, 253)'
            }],
          },
          options: {
            scales: {
              x: {
                type: 'time',
                time: {
                  unit: 'month',
                  displayFormats: {
                    month: 'MMM yyyy'
                  }
                }
              },
              y: {}
            }
          }
        }),
      });
    }
  });

  if (loggedInUser) {
    $('.player .fixed-table-toolbar .columns').append(
        // кнопки у таблицы игроков:
        '<button type="button" id="player-actualize" class="bi bi-arrow-down-up btn btn-primary"></button>' + // актуализации участников
        '<button type="button" id="player-arhive" class="bi bi-box-seam btn btn-danger"></button>' + // архивирования
        '<button type="button" class="btn bi-person-add btn-success" data-bs-toggle="modal" data-bs-target="#player-signup-window"></button>' // добавления нового пользователя
    );
    $('#player-actualize').click(async () => {
      await $.post('/api/users/actualize');
      refresh.table.player();
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

const archiveUser = (id, name) => {
  if (confirm(`Сделать игрока ${name} неактивным?`)) {
    $.post(`/api/users/archive/${id}`);
    refresh.table.player();
    refresh.table.archive();
  }
}

const unarchiveUser = (id, name) => {
  if (confirm(`Сделать игрока ${name} активным?`)) {
    $.post(`/api/users/unarchive/${id}`);
    refresh.table.player();
  }
  refresh.table.archive();
}

const changeRating = (id, name, rating) => {
  if (confirm(`Изменить рейтинг игрока ${name} на ${rating}?`)) {
    $.post(`/api/users/rating/${id}?new=${rating}`);
    refresh.table.player();
  }
}
