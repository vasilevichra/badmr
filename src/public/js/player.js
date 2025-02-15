const renderPlayers = () => {
  $('#player-table')
  .bootstrapTable({
    url: '/api/users/',
    search: true,
    sortName: 'rating',
    sortOrder: 'desc',
    showMultiSort: true,
    showMultiSortButton: true,
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
  .on('click-cell.bs.table', (field, value, row, $element) => {
    if (value === 'name') {
      renderPlayerModal($element);
    }
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

const renderPlayerModal = (player) => {
  $.getJSON(`/api/users/${player['id']}`, user => {
    player['patronymic'] = user.patronymic;
    player['birthday'] = user.birthday;
    player['age'] = age(user.birthday);

    $("#player-window").html($(playerModalTemplate(player)));

    let modal = new bootstrap.Modal(document.getElementById('player-window'));

    new Chart(document.getElementById("line-chart"), {
      type: 'line',
      data: {
        labels: [1500,1600,1700,1750,1800,1850,1900,1950,1999,2050],
        datasets: [{
          data: [86,114,106,106,107,111,133,221,783,2478],
          label: "Africa",
          borderColor: "#3e95cd",
          fill: false
        }, {
          data: [282,350,411,502,635,809,947,1402,3700,5267],
          label: "Asia",
          borderColor: "#8e5ea2",
          fill: false
        }, {
          data: [168,170,178,190,203,276,408,547,675,734],
          label: "Europe",
          borderColor: "#3cba9f",
          fill: false
        }, {
          data: [40,20,10,16,24,38,74,167,508,784],
          label: "Latin America",
          borderColor: "#e8c3b9",
          fill: false
        }, {
          data: [6,3,2,2,7,26,82,172,312,433],
          label: "North America",
          borderColor: "#c45850",
          fill: false
        }
        ]
      },
      options: {
        title: {
          display: true,
          text: 'World population per region (in millions)'
        }
      }
    });

    modal.show();
  });
}

const playerModalTemplate = (player) => `
<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
  <div class="modal-content">
    <div class="modal-header">
      <h5 class="modal-title">${player['name']} ${player['patronymic']}</h5>
      <button type="button"
              class="btn-close"
              data-bs-dismiss="modal"
              aria-label="Close">
      </button>
    </div>
    <div class="modal-body">
      <div class="avatar">
        <img class="avatar-img" src="data:image/png;base64, ${player['pic']}" alt="user@email.com" width="200">
      </div>
      <label id="player-window-label-birthday">${player['birthday']} (${player['age']})</label>
    </div>
    <canvas id="line-chart" width="800" height="450"></canvas>
    <div class="modal-footer">
    </div>
  </div>
</div>`;