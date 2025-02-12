const renderPlayers = () => {
  $('#player-table')
  .bootstrapTable({
    url: '/api/users/',
    search: true,
    sortName: 'rating',
    sortOrder: 'desc',
    /*pagination: true, pageSize: 20, pageNumber: 1,*/
    showRefresh: true,
    columns: [
      {
        title: '№',
        align: 'center',
        formatter: (value, row, index) => {
          return index + 1;
        }
      },
      {
        field: 'registered',
        title: 'Участвует?',
        checkbox: true,
        sortable: true,
        cellStyle: function (value, row) {
          return row.enabled === 0 || {css: {"background-color": "rgba(143,237,100,0.13)"}};
        }
      },
      {
        field: 'name',
        title: 'Имя',
        sortable: true,
        formatter: (value, row) => {
          const avatar = row.pic ? '<img src="data:image/png;base64, ' + row.pic + '" alt="' + value + '" width="30" height="30"/>'
              : (row.sex ? '👨🏻‍🦰' : '👩🏻');
          return avatar + ' ' + value + ' <nobr style="color: rgba(128,128,128,0.3)">#' + row.id + '</nobr>';
        },
        cellStyle: function (value, row) {
          return row.sex ? {css: {"white-space": "nowrap", "background-color": "rgba(100,149,237,0.13)"}}
              : {css: {"background-color": "rgba(250,218,221,0.33)"}};
        }
      },
      {
        field: 'rating',
        title: 'Рейтинг',
        align: 'center',
        sortable: true
      },
      {
        field: 'delta_today',
        title: 'Д',
        align: 'center',
        sortable: true,
        formatter: (value) => {
          return value > 0 ? '+' + value : value;
        },
        cellStyle: function (value) {
          return playerDeltaCss(value);
        }
      },
      {
        field: 'delta_week',
        title: 'Н',
        align: 'center',
        sortable: true,
        formatter: (value) => {
          return value > 0 ? '+' + value : value;
        },
        cellStyle: function (value) {
          return playerDeltaCss(value);
        }
      },
      {
        field: 'delta_month',
        title: 'М',
        align: 'center',
        sortable: true,
        formatter: (value) => {
          return value > 0 ? '+' + value : value;
        },
        cellStyle: function (value) {
          return playerDeltaCss(value);
        }
      },
      {
        field: 'matches',
        title: 'Сыграно',
        align: 'center',
        sortable: true
      },
      {
        field: 'city',
        title: 'Город',
        align: 'center',
        sortable: true
      },
      {
        field: 'birthday',
        title: 'День рождения',
        align: 'center',
        sortable: true,
        formatter: (value) => {
          // return '<button class="btn btn-secondary" @click="clickRow(row)">Click</button>'
          return `${value} (${age(value)})`;
        }
      }
    ]
  })
  .on('check-all.bs.table', () => {
    $.post(`/api/users/register`);
    showSelectButton();
  })
  .on('check.bs.table', (row, element) => {
    $.post(`/api/users/register/${element.id}`);
    showSelectButton();
  })
  .on('uncheck-all.bs.table', () => {
    $.post(`/api/users/deregister`);
  })
  .on('uncheck.bs.table', (row, element) => {
    $.post(`/api/users/deregister/${element.id}`);
  })
  .on('click-row.bs.table td', function (e, row, $element) {
    let modal = new bootstrap.Modal(document.getElementById('player-window'));

    function showModal() {
      modal.show();
    }

    // showModal();
  });
}

const playerDeltaCss = (value) => {
  if (value > 0) {
    return {css: {"color": "rgb(0,153,0)"}};
  }
  if (value < 0) {
    return {css: {"color": "rgb(255,0,0)"}};
  }
  return {css: {}};
}
