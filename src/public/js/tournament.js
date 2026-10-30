const renderTournaments = () => {
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
        title: isPhone() ? 'Турнир' : 'Название турнира',
        align: 'center'
      },
      {
        field: 'current',
        title: 'Текущий?',
        radio: true
      },
      // {
      //   field: 'available',
      //   title: 'Доступен?',
      //   checkbox: true
      // }
    ].filter(column => isPhone() ? !['id'].includes(column.field) : true)
  });
}

$('#tournament-add-select-club')
.select2({
  ajax: {
    url: '/api/user-clubs/select',
  },
})
.on('select2:selecting', s => {
  $('#tournament-add-select-gym')
  .prop('disabled', false)
  .select2({
    ajax: {
      url: `/api/gyms/select/${s.params.args.data.id}`,
    },
    dropdownParent: $('#tournament-add'),
  }).empty();
});

$('#tournament-add-select-type')
.select2({
  ajax: {
    url: '/api/tournament-types/select',
  },
});

if (loggedInUser) {
  $('#tournament-add input[name=user]').attr('value', loggedInUser.id);
}

const tournamentNewRegistrationHandler = _.debounce(function(input) {
  const cookieName = 'registration-input';
  $.cookie(cookieName, input);

  const hintSection = $('#tournament-new-registration-hint');

  hide.register.all();

  if (input.length > 2) {
    const names = input.match(/(?<lastname>[а-яА-Я]+)?(\s+)?(?<firstname>[а-яА-Я]+)?(\s+)?(?<patronymic>[а-яА-Я]+)?/).groups;
    if (names.lastname) {
      const ln = capitalizeFirstLetter(names.lastname);
      const fn = names.firstname ? capitalizeFirstLetter(names.firstname) : '';
      const pn = names.patronymic ? capitalizeFirstLetter(names.patronymic) : '';
      show.register.lastname(ln);
      hide.register.firstname();
      hide.register.patronymic();

      if (fn) {
        show.register.firstname(fn);
        hide.register.patronymic();
        hide.register.account();
        hide.register.rate();
      }
      if (pn) {
        show.register.patronymic(pn);
        show.register.rate(300);
        hide.register.account();
      }

      // поиск зарегистрированных — асинхронно (sync-запрос блокировал ввод)
      const self = this;
      $.getJSON(`/api/users/find?lastname=${ln}&firstname=${fn}&patronymic=${pn}&tournament=${$('body').data('tournament')}`, (users) => {
      if (users.length >= 1) {
        if (users.length === 1) {
          const u = users[0];

          show.register.user.existed.section();
          hide.register.lastname();
          hide.register.firstname();
          hide.register.patronymic();

          const playerNameWithCity = self.share.playerNameFormatter(u.id, `${u.lastname} ${u.firstname}`, u.sex, u.pic, isPhone()) + `<span class="mx-2 no-selection">(${u.city})</span>`;
          $.ajax({
            url: `/api/users/registered/${u.id}`,
            success: (data) => {
              if (data.registered === 1) {
                $('#tournament-new-add-existed-username').html(playerNameWithCity + '<span class="no-selection">уже <b>зарегистрирован</b> на турнире</span>');
              } else {
                $('#tournament-new-add-existed-username').html(playerNameWithCity);
                show.register.user.existed.addButton().off('click').on('click', () =>
                    $.ajax({
                      url: `/api/users/register/${u.id}`,
                      type: 'POST',
                      success: () => {
                        hide.register.all();
                        // блока «Игроки» могло не быть (не было зарегистрированных) — тогда страница перезагрузится и блок отрисуется
                        if ($('#player-table').length) refresh.table.player();
                        else location.reload();
                        $('.tournament-new-registration-input').val('').trigger('input');
                        $.removeCookie(cookieName);
                      },
                    })
                    .then(() => closeRegistrationIfNeed())
                )
              }
            },
          });
        }
      } else {
        $.ajax({
          url: `/api/users/lab/search?name=${[ln, fn, pn].join(' ').trim()}`,
          method: 'GET',
          async: true,
          success: user => {
            if (user) {
              const {lastname, firstname, patronymic} = parseName(user.name);
              show.register.lastname(lastname);
              show.register.firstname(firstname);
              if (patronymic) {
                show.register.patronymic(patronymic);
              }
              show.register.account(user.id);
              hintSection
              .find('[name=account]')
              .off('click')
              .on('click', () => window.open(`https://badminton4u.ru/players/${user.id}`, '_blank'));

              show.register.rate(user.r2);
              show.register.sex(lastname, firstname, patronymic);
              show.register.user.new.regAddButton();
              $('#tournament-new-registration-hint-reg-btn').off('click').on('click', () => tournamentNewRegistrationAddHandler(user.city));
            }
          }
        });

        if (ln && fn) {
          show.register.user.new.regAddButton();

          $('#tournament-new-registration-hint-reg-btn').off('click').on('click', () => tournamentNewRegistrationAddHandler());

          $('#tournament-new-registration-hint-reset-btn').off('click').on('click', () => {
            show.register.search();
            refresh.block.by.id('tournament-new-registration-hint');
          });
        }
      }
      });
    }
  }
}, 750, {leading: false});

const tournamentNewRegistrationAddHandler = (city) => {
  $('#tournament-new-registration-hint input[type=text]:not([name=account])').each((i, e) => $(e)
      .prop('disabled', false)
      .css({'border': '', 'background-color': '', 'margin-right': '1em'})
      .removeClass('fw-bold')
  );

  show.register.user.new.all();
  if ($('#tournament-new-registration-hint input[name=account]').val() === '') {
    hide.register.account();
  }
  hide.register.search();

  const selectLocation = (obj, placeholder, default_id, default_parent_id) => {
    const objElement = $(`#tournament-new-registration-hint-${obj}`);
    const pluralObj = obj === 'city' ? 'cities' : obj + 's';
    objElement.select2({
      placeholder: placeholder,
      ajax: {
        url: `/api/${pluralObj}/select` + (default_parent_id ? `/${default_parent_id}` : ''),
      },
      dropdownParent: $('#tournament-new-registration-hint'),
    });
    $.get(`/api/${pluralObj}/${default_id}`)
    .then(o => objElement.append(new Option(o.name, o.id, true, true)).trigger('change'));
  };

  const setDefaultLocation = () =>
      Promise.all([
        $.get(withTournament('/api/settings/state')),  // 0
        $.get('/api/settings/region'), // 1
        $.get('/api/settings/city')    // 2
      ]).then(promises => {
        selectLocation('state', 'Страна', promises[0]);
        selectLocation('region', 'Регион', promises[1], promises[0]);
        selectLocation('city', 'Город', promises[2], promises[1]);
      });

  Promise.resolve()
  .then(() => {
    if (city) {
      return $.get(`/api/cities/find?name=${city}`).then(geo => {
        if (geo) {
          selectLocation('state', 'Страна', geo.state_id);
          selectLocation('region', 'Регион', geo.region_id, geo.state_id);
          selectLocation('city', 'Город', geo.id, geo.region_id);
        } else {
          return setDefaultLocation();
        }
      });
    } else {
      return setDefaultLocation();
    }
  })
  .then(() => {
    $('#tournament-new-registration-hint-state').on('select2:selecting', s => {
      $('#tournament-new-registration-hint-region').select2({
        ajax: {
          url: `/api/regions/select/${s.params.args.data.id}`,
        },
        dropdownParent: $('#tournament-new-registration-hint'),
      }).empty();
    });

    $('#tournament-new-registration-hint-region').on('select2:selecting', r => {
      $('#tournament-new-registration-hint-city').select2({
        ajax: {
          url: `/api/cities/select/${r.params.args.data.id}`,
        },
        dropdownParent: $('#tournament-new-registration-hint'),
      }).empty();
    });
  });

  // добавляю форму для проверки required полей
  $('#tournament-new-registration-hint .row').wrap('<form></form>');

  $('#tournament-new-registration-hint-reg-btn')
  .removeClass('mb-2').addClass('mb-1') // опускаю кнопку пониже
  .off('click').on('click', () => { // заменяю функцию добавления полей ввода на регистрацию игрока
    $('input:invalid').each((i, e) => $(e).addClass('is-invalid'));
    $('input:valid').each((i, e) => $(e).removeClass('is-invalid'));
    if ($('.required').filter(function () {
      return ($(this).val().length === 0);
    }).length !== 0) {
      return false;
    }

    $.ajax({
      url: '/api/users/create',
      method: 'POST',
      async: false,
      data: $('#tournament-new-registration-hint form').serialize(),
      success: user => {
        $.ajax({
          url: `/api/users/register/${user.id}`,
          method: 'POST',
          async: false,
          success: () => {
            // блока «Игроки» могло не быть (не было зарегистрированных) — тогда страница перезагрузится и блок отрисуется
            if ($('#player-table').length) refresh.table.player();
            else location.reload();
            show.register.search();
            $('.tournament-new-registration-input').val('').trigger('input');
            $.removeCookie('registration-input');
            closeRegistrationIfNeed();
          }
        });
      }
    });
  });
}

$('#tournament-add form').submit(() => {
  $.ajax({
    url: '/api/tournaments/create',
    method: 'POST',
    async: false,
    data: $('#tournament-add form').serialize(),
  });
});

// статус проверяем асинхронно: зарегистрировано меньше, чем capacity —
// закрываем регистрацию (без блокирующих запросов)
const closeRegistrationIfNeed = () => {
  $.when($.getJSON(withTournament('/api/tournaments/registered/count')), $.getJSON(withTournament('/api/settings/')))
  .done((count, settings) => {
    const capacity = Number(settings[0].find((row) => row.name === 'capacity')?.value ?? 0);
    if (count[0] < capacity) {
      $.post('/api/tournaments/status/2');
    }
  });
}