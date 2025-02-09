// const host = window.location.host;
// const port = window.location.port;

$(document).ready(function () {

  // window.onbeforeunload = () => 'Are you sure you want to leave?';

  $(".navbar a").click(function () {
    $("body,html").animate({scrollTop: $("#" + $(this).data('value')).offset().top}, 100)
  });

  $('#tournament-table')
  .bootstrapTable({
    url: '/api/tournaments/', columns: [
      {
        field: 'id',
        title: 'ID',
        align: 'center'
      },
      {
        field: 'name',
        title: 'Название турнира',
        align: 'center'
      },
      {
        field: 'current',
        title: 'Текущий',
        radio: true
      },
      {
        field: 'available',
        title: 'Доступен?',
        checkbox: true
      }]
  });

  $('#settings-table')
  .bootstrapTable({
    url: '/api/settings/', columns: [
      {
        field: 'name',
        title: 'Название',
        align: 'center'
      },
      {
        field: 'value',
        title: 'Значение',
        align: 'center'
      },
      {
        field: 'description',
        title: 'Описание'
      }
    ]
  });

  $('#cort-table')
  .bootstrapTable({
    url: '/api/courts/', columns: [
      {
        field: 'number',
        title: 'Номер',
        align: 'center'
      },
      {
        field: 'available',
        title: 'Доступен?',
        checkbox: true
      }
    ]
  })
  .on('check-all.bs.table', () => {
    $.post(`/api/courts/enable`);
  })
  .on('check.bs.table', (row, element) => {
    $.post(`/api/courts/enable/${element.number}`);
  })
  .on('uncheck-all.bs.table', () => {
    $.post(`/api/courts/disable`);
  })
  .on('uncheck.bs.table', (row, element) => {
    $.post(`/api/courts/disable/${element.number}`);
  });

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
          const avatar = row.pic ? '<img src="data:image/png;base64, ' + row.pic + '" alt="'+ value + '" width="30" height="30"/>' : (row.sex ? '👨🏻‍🦰' : '👩🏻');
          return avatar + ' ' + value + ' <nobr style="color: rgba(128,128,128,0.3)">#' + row.id + '</nobr>';
        },
        cellStyle: function (value, row) {
          return row.sex ? {css: {"white-space": "nowrap", "background-color": "rgba(100,149,237,0.13)"}} : {css: {"background-color": "rgba(250,218,221,0.33)"}};
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
          if (value > 0) {
            return {css: {"color": "rgb(0,153,0)"}};
          }
          if (value < 0) {
            return {css: {"color": "rgb(255,0,0)"}};
          }
          return {css: {}};
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
          if (value > 0) {
            return {css: {"color": "rgb(0,153,0)"}};
          }
          if (value < 0) {
            return {css: {"color": "rgb(255,0,0)"}};
          }
          return {css: {}};
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
          if (value > 0) {
            return {css: {"color": "rgb(0,153,0)"}};
          }
          if (value < 0) {
            return {css: {"color": "rgb(255,0,0)"}};
          }
          return {css: {}};
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
  })
  .on('check.bs.table', (row, element) => {
    $.post(`/api/users/register/${element.id}`);
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

  const selectColumns = [
    {
      field: 'user_id',
      title: 'ID',
      align: 'center'
    },
    {
      field: 'name',
      title: 'Имя'
    },
    {
      field: 'sex',
      title: 'Пол',
      align: 'center'
    },
    {
      field: 'rating',
      title: 'Рейтинг',
      align: 'center'
    },
    {
      field: 'matches',
      title: 'Сыграно',
      align: 'center'
    }
  ];

  $('#select-button').click(() => {
    $.getJSON("/api/common/ready/", ready => {
      $('#select-button').hide();
      if (ready.join("").length) {
        $('.select-form').show();
        $.getJSON("/api/matches/unfinished/has", unfinished_matches => {
          if (unfinished_matches.has) {
            $('.select-form-button-submit').prop("disabled", true);
          }
        });

        $.each(ready, (i, field) => {
          let players1 = field.players1;
          let players2 = field.players2;
          $('.select-form-table-1')
          .bootstrapTable({
            data: field.players1, columns: selectColumns,
          });
          $('.select-form-table-2')
          .bootstrapTable({
            data: field.players2, columns: selectColumns
          });
          $('.select-form-info').text(`Δ ${field.diff.toFixed(1)} баллов`);
          $('.select-form-button-submit').click(() => {
            $.post('/api/matches/create', {
                  user_1_id: players1[0].user_id,
                  user_2_id: players1[1].user_id,
                  user_3_id: players2[0].user_id,
                  user_4_id: players2[1].user_id
                }
            );

            // todo устранить прыжок на начало страницы
            scrollToId('game'); // а это не работает
          });
        });
      } else {
        $('#select-info').show();
      }
    });
  });

  $.getJSON("/api/matches/unfinished", result => {
    if (result.length > 0) {
      // result.forEach((row) => {})
      $('.game-info').hide();
      $('.game-form').show();
      const match = result[0];
      renderMatch(match);
    }
  });
});

function age(date) {
  const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.2425;
  const [day, month, year] = date.split('.');
  return Math.floor((new Date().getTime() - new Date(+year, +month - 1, +day).getTime()) / MS_PER_YEAR);
}

function renderMatch(match) {
  $('.game-table-1')
  .bootstrapTable({
    showHeader: false,
    columns: [{
      field: 'name',
      title: 'Name'
    }],
    data: [{
      name: match.name1
    }, {
      name: match.name2
    }]
  });

  $('.game-table-2')
  .bootstrapTable({
    showHeader: false,
    columns: [{
      field: 'name',
      title: 'Name'
    }],
    data: [{
      name: match.name3
    }, {
      name: match.name4
    }]
  });

  $('.game-form-info').text(`Корт №${match.court}`);

  $('.game-form-button-submit').click((event) => {
    event.preventDefault();

    const gamePoint11 = $('.game-input-11').val();
    const gamePoint12 = $('.game-input-12').val();
    const gamePoint21 = $('.game-input-21').val();
    const gamePoint22 = $('.game-input-22').val();
    const gamePoint31 = $('.game-input-31').val();
    const gamePoint32 = $('.game-input-32').val();

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

    if (is11) {
      $.post('/api/games/create', {
            match_id: match.id,
            lost_1_by: gamePoint11,
            lost_2_by: null
          }
      );
    } else {
      $.post('/api/games/create', {
            match_id: match.id,
            lost_1_by: null,
            lost_2_by: gamePoint12
          }
      );
    }

    if (is21) {
      $.post('/api/games/create', {
            match_id: match.id,
            lost_1_by: gamePoint21,
            lost_2_by: null
          }
      );
    } else {
      $.post('/api/games/create', {
            match_id: match.id,
            lost_1_by: null,
            lost_2_by: gamePoint22
          }
      );
    }
    if (need3) {
      if (is31) {
        $.post('/api/games/create', {
              match_id: match.id,
              lost_1_by: gamePoint31,
              lost_2_by: null
            }
        );
      } else {
        $.post('/api/games/create', {
              match_id: match.id,
              lost_1_by: null,
              lost_2_by: gamePoint32
            }
        );
      }
    }
    $('.game-info').show();
    $('.game-form').hide();
    $('#player-table').bootstrapTable('refresh');
    // todo остановился тут
  });
}