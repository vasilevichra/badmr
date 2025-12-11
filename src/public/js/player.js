const renderPlayers = (B_max, C_max, D_max, E_max, F_max, G_max, H_max) => {
  $('#player-table')
  .bootstrapTable({
    url: '/api/users/',
    search: loggedInUser && isNotPhone(),
    sortName: 'rating',
    sortOrder: 'desc',
    /*pagination: true, pageSize: 20, pageNumber: 1,*/
    showRefresh: loggedInUser && isNotPhone(),
    columns: [
      {
        title: '№',
        field: '#',
        align: 'center',
        formatter: (value, row, index) => index + 1,
      },
      {
        field: 'registered',
        title: 'Участвует?',
        checkbox: true,
        sortable: true,
        cellStyle: (value, row) => row.enabled === 0 || {css: {"background-color": "rgba(143,237,100,0.13)"}},
      },
      {
        field: 'name',
        title: 'Имя',
        sortable: true,
        formatter: (value, row) => this.share.playerNameFormatter(row.id, value, row.sex, row.pic, isPhone()),
        cellStyle: (value, row) => playerSexStyle(row.sex),
      },
      {
        field: 'rating',
        title: isPhone() ? 'Р.' : 'Рейтинг',
        align: 'center',
        sortable: true,
        formatter: (value, row) => playerRatingGroupsFormatter(row.rating, B_max, C_max, D_max, E_max, F_max, G_max, H_max),
        cellStyle: (value, row) => playerRatingGroupsStyle(row.rating, B_max, C_max, D_max, E_max, F_max, G_max, H_max),
      },
      {
        field: 'delta_today',
        title: 'Д',
        align: 'center',
        sortable: true,
        formatter: value => value > 0 ? '+' + value : value,
        cellStyle: value => playerDeltaCss(value),
      },
      {
        field: 'delta_week',
        title: 'Н',
        align: 'center',
        sortable: true,
        formatter: value => value > 0 ? '+' + value : value,
        cellStyle: value => playerDeltaCss(value),
      },
      {
        field: 'delta_month',
        title: 'М',
        align: 'center',
        sortable: true,
        formatter: value => value > 0 ? '+' + value : value,
        cellStyle: value => playerDeltaCss(value),
      },
      {
        field: 'matches',
        title: 'Сыграно',
        align: 'center',
        sortable: true,
      },
      {
        field: 'city',
        title: 'Город',
        align: 'center',
        sortable: true,
      }
    ]
    .filter(column => loggedInUser ? true : !['registered'].includes(column.field))
    .filter(column => isPhone() ? ['registered', 'name', 'rating'].includes(column.field) : true)
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
  .on('click-cell.bs.table', (field, value, row, element) => {
    if (value === 'name') {
      $.getJSON(`/api/users/rating/${element['id']}`, result => {
        element['rating'] = result.rating;
        renderPlayerModal(element);
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
    $('#player-actualize').click(() => {
      $.post('/api/users/actualize');
      $('#player-table').bootstrapTable('refresh');
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
    $('#player-table').bootstrapTable('refresh');
    $('#player-archive-table').bootstrapTable('refresh');
  }
}

const unarchiveUser = (id, name) => {
  if (confirm(`Сделать игрока ${name} активным?`)) {
    $.post(`/api/users/unarchive/${id}`);
    $('#player-table').bootstrapTable('refresh');
  }
  $('#player-archive-table').bootstrapTable('refresh');
}

const changeRating = (id, name, rating) => {
  if (confirm(`Изменить рейтинг игрока ${name} на ${rating}?`)) {
    $.post(`/api/users/rating/${id}?new=${rating}`);
    $('#player-table').bootstrapTable('refresh');
  }
}

const renderPlayerModal = (player) => {
  $.getJSON(`/api/users/${player['id']}`, user => {
    player['patronymic'] = user.patronymic;
    player['birthday'] = user.birthday;
    player['age'] = age(user.birthday);

    $("#player-window").html($(playerModalTemplate(player)));

    if (loggedInUser) {
      const archiveButton = $('.player-window-archive-button');
      archiveButton.show();
      archiveButton.click(() => {
        archiveUser(player['id'], player['name']);
      });

      $(".player-window-change-rating-form").show();
      const changeRatingButton = $('.player-window-change-rating-button');
      changeRatingButton.click(() => {
        const rating = $('.player-window-change-rating-input').val();
        changeRating(player['id'], player['name'], rating);
      });
    }

    let modal = new bootstrap.Modal(document.getElementById('player-window'));

    // new Chart(document.getElementById("line-chart"), {
    //   type: 'line',
    //   data: {
    //     labels: [1500, 1600, 1700, 1750, 1800, 1850, 1900, 1950, 1999, 2050],
    //     datasets: [{
    //       data: [86, 114, 106, 106, 107, 111, 133, 221, 783, 2478],
    //       label: "Africa",
    //       borderColor: "#3e95cd",
    //       fill: false
    //     }, {
    //       data: [282, 350, 411, 502, 635, 809, 947, 1402, 3700, 5267],
    //       label: "Asia",
    //       borderColor: "#8e5ea2",
    //       fill: false
    //     }, {
    //       data: [168, 170, 178, 190, 203, 276, 408, 547, 675, 734],
    //       label: "Europe",
    //       borderColor: "#3cba9f",
    //       fill: false
    //     }, {
    //       data: [40, 20, 10, 16, 24, 38, 74, 167, 508, 784],
    //       label: "Latin America",
    //       borderColor: "#e8c3b9",
    //       fill: false
    //     }, {
    //       data: [6, 3, 2, 2, 7, 26, 82, 172, 312, 433],
    //       label: "North America",
    //       borderColor: "#c45850",
    //       fill: false
    //     }
    //     ]
    //   },
    //   options: {
    //     title: {
    //       display: true,
    //       text: 'World population per region (in millions)'
    //     }
    //   }
    // });

    modal.show();
  });
}

const playerModalTemplate = player => `
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
      <button class="player-window-archive-button bi bi-box-seam btn btn-outline-danger" type="button" style="display:none;">  Архивировать</button>
      <form class="player-window-change-rating-form" style="display:none;">
        <input class="player-window-change-rating-input" type="number" placeholder="рейтинг" maxlength="5" size="5" value="${player['rating']}" required>
        <button class="player-window-change-rating-button bi bi-box-seam btn btn-outline-warning" type="button">  Изменить рейтинг</button>
      </form>
    </div>
    <canvas id="line-chart" width="800" height="450"></canvas>
    <div class="modal-footer">
    </div>
  </div>
</div>`;
