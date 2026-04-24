renderGroups = () => {

  const groupsAddModal = $("#tournament-groups-team-add");
  const userSelector = $("#tournament-groups-team-add-select-users");

  $('#tournament-groups-team-add-select-group').select2({
    placeholder: 'Группа',
    ajax: {
      url: '/api/groups/select',
      dataType: 'json',
      cache: true
    },
    dropdownParent: groupsAddModal,
  });
  $('#tournament-groups-team-add-select-group').val('1');
  $('#tournament-groups-team-add-select-group').trigger('change');

  $('#tournament-groups-team-add-select-city').select2({
    placeholder: 'Город',
    ajax: {
      url: '/api/cities/select',
      dataType: 'json',
      cache: true
    },
    dropdownParent: groupsAddModal,
  })
  .on('change', e => {
    userSelector.select2("destroy");
    selectUsersByCity();
  });

  $('#tournament-groups-team-add-select-color').select2({
    placeholder: 'Цвет',
    ajax: {
      url: '/api/teams/colors/select',
      dataType: 'json',
    },
    templateResult: d => $(`<nobr><span style="background:#${d.hex}"></span>${d.text}</nobr>`),
    templateSelection: d => $(`<nobr><span style="background:#${d.hex}"></span>${d.text}</nobr>`),
    dropdownParent: groupsAddModal,
  });

  const getSelectedCityId = () => {
    const citySelector = $("#tournament-groups-team-add-select-city :selected");
    return citySelector.length > 0 ? citySelector[0].value : 0;
  }

  const getSelectedId = (id) => {
    const selector = $(`#${id} :selected`);
    return selector.length > 0 ? Number(selector[0].value) : 0;
  }

  const selectUsersByCity = () => userSelector.select2({
    placeholder: 'Игроки',
    ajax: {
      url: `/api/users/select/${getSelectedCityId() || 1}`,
      dataType: 'json',
    },
    dropdownParent: groupsAddModal,
  });

  selectUsersByCity();

  $('#tournament-groups-team-add-submit').click((event) => {
    event.preventDefault();

    const groupId = getSelectedId('tournament-groups-team-add-select-group');
    const userIds = $('#tournament-groups-team-add-select-users').select2("val");

    $.ajax({
      url: '/api/teams/create',
      type: 'POST',
      cache: false,
      async: false,
      dataType: "json",
      contentType: "application/json",
      data: JSON.stringify({
        tournament_id: 2, // todo /api/tournaments/current
        group_id: groupId,
        name: String($('#tournament-groups-team-add-add-name').val()),
        city_id: getSelectedId('tournament-groups-team-add-select-city'),
        team_color_id: getSelectedId('tournament-groups-team-add-select-color')
      }),
      success: result => {
        userIds.forEach(userId => {
          $.ajax({
                url: '/api/teams/users/create',
                type: 'POST',
                cache: false,
                async: false,
                dataType: "json",
                contentType: "application/json",
                data: JSON.stringify({
                  team_id: result.id,
                  user_id: Number(userId),
                  group_id: groupId
                }),
              }
          );
        });

        $('#tournament-groups-team-add .btn-close').click();
        refresh.block.by.id('tournament-groups');
      },
      error: function (jqXHR, exception) {
        var msg = '';
        if (jqXHR.status === 0) {
          msg = 'Not connect.\n Verify Network.';
        } else if (jqXHR.status == 404) {
          msg = 'Requested page not found. [404]';
        } else if (jqXHR.status == 500) {
          msg = 'Internal Server Error [500].';
        } else if (exception === 'parsererror') {
          msg = 'Requested JSON parse failed.';
        } else if (exception === 'timeout') {
          msg = 'Time out error.';
        } else if (exception === 'abort') {
          msg = 'Ajax request aborted.';
        } else {
          msg = 'Uncaught Error.\n' + jqXHR.responseText;
        }
        alert(msg);
      },
    });
  });
}

const editTeam = (id, teamName) => {

  const groupsEditModal = $(`#tournament-groups-team-edit-${id}`);

  const citySelect = $(`#tournament-groups-team-edit-select-city-${id}`);
  citySelect.select2({
    placeholder: 'Город',
    ajax: {
      url: '/api/cities/select',
      dataType: 'json',
      cache: true
    },
    dropdownParent: groupsEditModal,
    dropdownAutoWidth: true,
    theme: "bootstrap-5"
  });

  $.ajax({url: `/api/cities/team/${id}`})
  .then(c => citySelect.append(new Option(c.name, c.id, true, true)).trigger('change'));

  citySelect
  .on('change', () => $(`span[aria-controls="select2-tournament-groups-team-edit-select-city-${id}-container"]`).css("border-color", ""))
  .on('input', function (e) {
    let cityId = Number($(this).select2('data')[0].id);
    $.post(`/api/teams/${id}/city/${cityId}`)
    .fail(() => $(`span[aria-controls="select2-tournament-groups-team-edit-select-city-${id}-container"]`).css("border-color", "red"));
  });

  $(`#tournament-groups-team-edit-${id} form input`).val(teamName);

  const renderSelector = (i, position, placeholder) => {

    const positionSelect = $(`.tournament-groups-team-edit-select-${position}`)

    // прорисовка селектора
    positionSelect.select2({
      placeholder: placeholder,
      ajax: {
        type: 'GET',
        url: `/api/teams/${id}/order/${i}`,
        dataType: 'json',
        cache: false,
        processResults: function (data) {
          return {
            results: $.map(data, function (item) {
              return {
                id: item.id,
                title: item.name,
                text: this.share.playerNameFormatter(item.id, item.name, item.sex, item.pic, isPhone()),
              }
            })
          };
        }
      },
      escapeMarkup: markup => markup,
      dropdownParent: groupsEditModal,
      dropdownAutoWidth: false,
      width: '10%',
      theme: 'bootstrap-5',
    });

    // установка выбранного ранее значения
    $.get(`/api/teams/${id}/position/${i}`)
    .then(c => {
      if (c) {
        return positionSelect
        .append(new Option(this.share.playerNameFormatter(c.id, c.name, c.sex, c.pic, isPhone()), c.id, true, true))
        .trigger('change');
      }
    });

    // сохранить в базу на изменение значения
    positionSelect.on('input', function (e) {
      let teamUserId = Number($(this).select2('data')[0].id);
      if (teamUserId !== 0) {
        $.post(`/api/teams/${id}/order/${i}?team_user_id=${teamUserId}`);
      }
    });
  }

  renderSelector(1, 'ms1', 'М');
  renderSelector(2, 'ws1', 'Ж');
  renderSelector(3, 'md11', 'М');
  renderSelector(4, 'md12', 'М');
  renderSelector(5, 'wd11', 'Ж');
  renderSelector(6, 'wd12', 'Ж');
  renderSelector(7, 'xd11', 'М');
  renderSelector(8, 'xd12', 'Ж');

  renderSelector(9, 'ms2', 'М');
  renderSelector(10, 'ws2', 'Ж');
  renderSelector(11, 'md21', 'М');
  renderSelector(12, 'md22', 'М');
  renderSelector(13, 'wd21', 'Ж');
  renderSelector(14, 'wd22', 'Ж');
  renderSelector(15, 'xd21', 'М');
  renderSelector(16, 'xd22', 'Ж');

  groupsEditModal.modal('show');
};

const copyRound = (team_id) => {
  const copyPosition = (from, to) => {
    const teamUser = $(`.tournament-groups-team-edit-select-${from}`).select2('data')[0];
    $(`.tournament-groups-team-edit-select-${to}`).append(new Option(teamUser.name, Number(teamUser.id), true, true)).trigger('change');
  }

  copyPosition('ms1', 'ms2');
  copyPosition('ws1', 'ws2');
  copyPosition('md11', 'md21');
  copyPosition('md12', 'md22');
  copyPosition('wd11', 'wd21');
  copyPosition('wd12', 'wd22');
  copyPosition('xd11', 'xd21');
  copyPosition('xd12', 'xd22');
}

const editGroupUser = (element, team_id, user_id, user_group_id, user_group_name) => {
  const groupSelector = $(element);
  groupSelector.select2({
    ajax: {
      url: '/api/groups/select',
      dataType: 'json',
    },
    dropdownParent: $('.team-group-name'),
    dropdownAutoWidth: true,
    width: '100%',
    theme: "bootstrap-5",
  });

  groupSelector.append(new Option(user_group_name, user_group_id, true, true)).trigger('change');

  groupSelector.on('select2:select', function (e) {
    let groupId = e.params.data.id;
    let groupName = e.params.data.text;
    $.post(`/api/teams/${team_id}/users/${user_id}?group_id=${groupId}`)
    groupSelector.select2('destroy');
    groupSelector.empty();
    groupSelector.text(groupName);
  });
};

const playMatch110 = (teamId1, teamId2) => {
  const createMatch = () => $.ajax({
    url: '/api/matches/create110',
    type: 'POST',
    cache: false,
    async: false,
    dataType: "json",
    contentType: "application/json",
    data: JSON.stringify({
      team_1_id: teamId1,
      team_2_id: teamId2,
    }),
    success: data => {
      $.ajax({
        url: `/api/games/create110/${data.id}`,
        type: 'POST',
        cache: false,
      });
    }
  });

  $.get('/api/courts/')
  .then(c => {
    if (c === undefined || c.length === 0) {
      if (confirm('Нет свободных кортов. Создадим новый?')) {
        $.post('/api/courts/create');
        createMatch();
      }
    } else {
      createMatch()
    }
  });
}