renderGroups = () => {

  const groupsAddModal = $("#tournament-groups-team-add");
  const userSelector = $("#tournament-groups-team-add-select-users");

  $('#tournament-groups-team-add-select-group').select2({
    placeholder: 'Группа',
    ajax: {
      url: '/api/groups/select',
    },
    dropdownParent: groupsAddModal,
  });
  $('#tournament-groups-team-add-select-group').val('1');
  $('#tournament-groups-team-add-select-group').trigger('change');

  $('#tournament-groups-team-add-select-city').select2({
    placeholder: 'Город',
    ajax: {
      url: '/api/cities/select',
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
    },
    dropdownParent: groupsAddModal,
  });

  selectUsersByCity();

  $('#tournament-groups-team-add-submit').off('click').click((event) => {
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

        $('#tournament-groups-team-add .btn-close').off('click').click();
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
    },
    dropdownParent: groupsEditModal,
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

    // выборка строго внутри этой модалки: классы селектов одинаковы у всех
    // команд, глобальный поиск захватывал чужие модалки
    const positionSelect = groupsEditModal.find(`.tournament-groups-team-edit-select-${position}`)

    // прорисовка селектора
    positionSelect.select2({
      placeholder: placeholder,
      ajax: {
        type: 'GET',
        url: `/api/teams/${id}/order/${i}`,
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
    });

    // сохранить в базу на изменение значения
    positionSelect.on('input', function (e) {
      let teamUserId = Number($(this).select2('data')[0].id);
      if (teamUserId !== 0) {
        $.post(`/api/teams/${id}/order/${i}?team_user_id=${teamUserId}`);
      }
    });

    // установка выбранного ранее значения
    return $.get(`/api/teams/${id}/position/${i}`)
    .then(c => {
      if (c) {
        return positionSelect
        .append(new Option(this.share.playerNameFormatter(c.id, c.name, c.sex, c.pic, isPhone()), c.id, true, true))
        .trigger('change');
      }
    });
  }

  const selectors = [
    renderSelector(1, 'ms1', 'М'),
    renderSelector(2, 'ws1', 'Ж'),
    renderSelector(3, 'md11', 'М'),
    renderSelector(4, 'md12', 'М'),
    renderSelector(5, 'wd11', 'Ж'),
    renderSelector(6, 'wd12', 'Ж'),
    renderSelector(7, 'xd11', 'М'),
    renderSelector(8, 'xd12', 'Ж'),

    renderSelector(9, 'ms2', 'М'),
    renderSelector(10, 'ws2', 'Ж'),
    renderSelector(11, 'md21', 'М'),
    renderSelector(12, 'md22', 'М'),
    renderSelector(13, 'wd21', 'Ж'),
    renderSelector(14, 'wd22', 'Ж'),
    renderSelector(15, 'xd21', 'М'),
    renderSelector(16, 'xd22', 'Ж'),
  ];

  // после загрузки предыдущих позиций — авторасстановка, если остались
  // пустые ячейки (заполняются только пустые)
  $.when(...selectors).then(() => {
    if ([...maleSlots, ...femaleSlots].some(name => !slotSelect(id, name).val())) {
      autoOrder(id);
    }
  });

  groupsEditModal.modal('show');
};

const copyRound = (team_id) => {
  const modal = $(`#tournament-groups-team-edit-${team_id}`);
  const copyPosition = (from, to) => {
    const teamUser = modal.find(`.tournament-groups-team-edit-select-${from}`).select2('data')[0];
    modal.find(`.tournament-groups-team-edit-select-${to}`).append(new Option(teamUser.name, Number(teamUser.id), true, true)).trigger('change');
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

// слоты состава по полу в порядке заполнения: одиночный, пара, смешанный —
// сначала весь первый круг, потом весь второй; номер позиции — для API
const editSlots = {ms1: 1, ws1: 2, md11: 3, md12: 4, wd11: 5, wd12: 6, xd11: 7, xd12: 8, ms2: 9, ws2: 10, md21: 11, md22: 12, wd21: 13, wd22: 14, xd21: 15, xd22: 16};
const maleSlots = ['ms1', 'md11', 'md12', 'xd11', 'ms2', 'md21', 'md22', 'xd21'];
const femaleSlots = ['ws1', 'wd11', 'wd12', 'xd12', 'ws2', 'wd21', 'wd22', 'xd22'];
// выборка селекта строго внутри модалки этой команды: классы селектов
// одинаковы у всех команд, глобальный поиск захватывал чужие модалки
const slotSelect = (team_id, name) => $(`#tournament-groups-team-edit-${team_id} .tournament-groups-team-edit-select-${name}`);

// авторасстановка состава по пустым ячейкам: игроки сортируются от слабейшего
// к сильнейшему; позиции обходятся парами слотов «круг 1 / круг 2» — в первый
// круг встаёт слабейший подходящий игрок, во второй — следующий за ним, так
// что сильнейшая пара категории попадает во второй круг. Если игроков меньше,
// чем пустых слотов, они переиспользуются по кругу, но с учётом ограничений
// базы: одиночка не повторяется между кругами (ms1 != ms2, ws1 != ws2),
// партнёры по паре различаются (md11 != md12 и т.п.). Уже расставленные
// игроки не двигаются.
const autoOrder = (team_id) => {
  $.get(`/api/teams/${team_id}/roster`)
      .then(roster => {
        // расстановка на текущий момент: слот → team_user.id
        const placed = {};
        [...maleSlots, ...femaleSlots].forEach(name => {
          const id = slotSelect(team_id, name).select2('data')[0]?.id;
          if (id !== undefined) placed[name] = Number(id);
        });

        const pairPartner = {md11: 'md12', md12: 'md11', wd11: 'wd12', wd12: 'wd11', md21: 'md22', md22: 'md21', wd21: 'wd22', wd22: 'wd21'};
        const singlesTwin = {ms1: 'ms2', ms2: 'ms1', ws1: 'ws2', ws2: 'ws1'};
        // пары слотов «круг 1 / круг 2» одной позиции, по возрастанию силы
        const slotPairs = sex => sex === 1
            ? [['ms1', 'ms2'], ['md11', 'md21'], ['md12', 'md22'], ['xd11', 'xd21']]
            : [['ws1', 'ws2'], ['wd11', 'wd21'], ['wd12', 'wd22'], ['xd12', 'xd22']];

        const byRating = (a, b) => a.rating - b.rating;
        // слот принимает игрока, если тот не партнёр по паре и не «тёзка» одиночки
        const allowed = (name, p) =>
            !(pairPartner[name] && placed[pairPartner[name]] === p.id) &&
            !(singlesTwin[name] && placed[singlesTwin[name]] === p.id);
        // состав пола без уже расставленных до запуска игроков — они не двигаются;
        // снапшот на момент старта, иначе пул вымывается по ходу расстановки
        const pools = {};
        [1, 0].forEach(sex => {
          pools[sex] = roster.filter(p => p.sex === sex && !Object.values(placed).includes(p.id)).sort(byRating);
        });
        // кандидаты на слот: сначала незадействованные в этой расстановке,
        // при нехватке — переиспользование уже расставленных; в паре кругов
        // предпочитаем разных игроков (круг 2 — следующий по силе)
        const candidates = (sex, name, excludeId) => {
          const pool = pools[sex];
          const free = pool.filter(p => !Object.values(placed).includes(p.id));
          return free.find(p => p.id !== excludeId && allowed(name, p))
              ?? free.find(p => allowed(name, p))
              ?? pool.find(p => p.id !== excludeId && allowed(name, p))
              ?? pool.find(p => allowed(name, p));
        };
        const assign = (name, p) => {
          slotSelect(team_id, name).append(new Option(p.name, p.id, true, true)).trigger('change');
          $.post(`/api/teams/${team_id}/order/${editSlots[name]}?team_user_id=${p.id}`);
          placed[name] = p.id;
        };

        [1, 0].forEach(sex => {
          slotPairs(sex).forEach(([first, second]) => {
            let firstPick;
            if (!slotSelect(team_id, first).val()) {
              firstPick = candidates(sex, first);
              if (firstPick) assign(first, firstPick);
            }
            if (!slotSelect(team_id, second).val()) {
              const p = candidates(sex, second, firstPick && firstPick.id);
              if (p) assign(second, p);
            }
          });
        });
      });
}

const editGroupUser = (element, team_id, user_id, user_group_id, user_group_name) => {
  const groupSelector = $(element);
  groupSelector.select2({
    ajax: {
      url: '/api/groups/select',
    },
    dropdownParent: $('.team-group-name'),
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
        $.post('/api/courts/create', {}, () => createMatch());
      }
    } else {
      createMatch()
    }
  });
}
// вертикальные линии матрицы игр группы по левой границе названий колонок.
// Диагональная линия рисуется только если есть ячейки-маркеры diagonal-cross
// (сейчас их нет — диагональ убрана), функция оставлена для вертикалей
drawGroupsDiagonal = () => {
  document.querySelectorAll('svg.groups-diagonal').forEach(svg => svg.remove());

  document.querySelectorAll('table.tournament-groups-table-games').forEach(table => {
    const cells = table.querySelectorAll('td.diagonal-cross');

    const host = table.parentElement; // .d-flex — таблица + скрытые модалки, host выше таблицы
    const hostRect = host.getBoundingClientRect();
    const tableRect = table.getBoundingClientRect();

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'groups-diagonal');
    svg.setAttribute('width', hostRect.width);
    svg.setAttribute('height', hostRect.height);
    svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;';
    if (cells.length > 0) {
      const first = cells[0].getBoundingClientRect();
      const last = cells[cells.length - 1].getBoundingClientRect();
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', first.left - hostRect.left);
      line.setAttribute('y1', first.top - hostRect.top);
      line.setAttribute('x2', last.right - hostRect.left);
      line.setAttribute('y2', last.bottom - hostRect.top);
      // тоньше и незаметнее линий таблиц: цвет — как у их границ, толщина
      // 0.75 даёт по вертикали ~0.5px (у 45° линии проекция w·cos 45°)
      line.setAttribute('stroke', getComputedStyle(cells[0]).borderBottomColor);
      line.setAttribute('stroke-width', '0.75');
      svg.appendChild(line);
    }
    // вертикальные линии по левой границе названий остальных колонок —
    // насквозь: от верха таблицы до её низа;
    // ограничены таблицей, а не host — иначе уходят ниже ячеек
    const nameCells = table.querySelectorAll('td.game-column-name');
    if (nameCells.length === 0) return;
    // цвет — как у горизонтальных границ таблицы: border-bottom у name-ячеек
    // имеет width 0 и fallback в currentColor (чёрный), поэтому берём
    // border-left обычной игровой ячейки
    const stroke = getComputedStyle(table.querySelector('tbody td')).borderLeftColor;
    nameCells.forEach(cell => {
      const rect = cell.getBoundingClientRect();
      const cline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      cline.setAttribute('x1', rect.left - hostRect.left);
      cline.setAttribute('y1', tableRect.top - hostRect.top);
      cline.setAttribute('x2', rect.left - hostRect.left);
      cline.setAttribute('y2', tableRect.bottom - hostRect.top);
      cline.setAttribute('stroke', stroke);
      cline.setAttribute('stroke-width', '0.75');
      svg.appendChild(cline);
    });
    // горизонтальные линии — только под вертикальными названиями колонок
    // (нижняя граница каждой rowspan-ячейки): продолжают разделители строк
    // «ступенькой», не перечёркивая сам текст названий; название первой
    // колонки — обычная ячейка шапки (без rowspan и класса), ступенька
    // под ней продолжает диагональ
    const firstHeaderCell = table.querySelector('tbody tr').cells[1];
    [firstHeaderCell, ...nameCells].forEach(cell => {
      if (!cell) return;
      const rect = cell.getBoundingClientRect();
      const rline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      rline.setAttribute('x1', rect.left - hostRect.left);
      rline.setAttribute('y1', rect.bottom - hostRect.top);
      rline.setAttribute('x2', rect.right - hostRect.left);
      rline.setAttribute('y2', rect.bottom - hostRect.top);
      rline.setAttribute('stroke', stroke);
      rline.setAttribute('stroke-width', '0.75');
      svg.appendChild(rline);
    });
    // вертикальная линия по правому краю колонки названий строк — граница
    // с первой игровой колонкой: у той заголовок — обычная ячейка шапки
    // (без rowspan-класса game-column-name), поэтому в общий цикл по
    // левой границе она не попадает
    const nameColumnCell = table.querySelector('tbody tr').cells[0];
    const ncRect = nameColumnCell.getBoundingClientRect();
    const nvline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    nvline.setAttribute('x1', ncRect.right - hostRect.left);
    nvline.setAttribute('y1', tableRect.top - hostRect.top);
    nvline.setAttribute('x2', ncRect.right - hostRect.left);
    nvline.setAttribute('y2', tableRect.bottom - hostRect.top);
    nvline.setAttribute('stroke', stroke);
    nvline.setAttribute('stroke-width', '0.75');
    svg.appendChild(nvline);
    host.style.position = 'relative';
    host.appendChild(svg);
  });
};

$(window).on('resize', _.debounce(drawGroupsDiagonal, 200));

// при наведении на ячейку матча (не только на кнопку) подсвечиваем обоих
// участников: название в строке слева и название колонки в шапке.
// j — колонка матрицы (0-based): после td с названием команды;
// названия колонок лежат в первой строке (rowspan-ячейки) по порядку j.
$(document).on('mouseenter mouseleave', 'table.tournament-groups-table-games td.tournament-groups-table-game', function (e) {
  const td = this;
  const row = td.closest('tr');
  const table = row.closest('table');
  const j = td.cellIndex - 1;
  const nameTd = table.querySelector('tbody').rows[0].cells[j + 1];
  [row.cells[0], nameTd].forEach(el => el && el.classList.toggle('game-hover', e.type === 'mouseenter'));
});

// отдых команд в матрице игр: минуты с момента последнего сыгранного матча
// (или старта турнира — он уже зашит в data-rest-start сервером).
// Обновление раз в 30 секунд; rating-minus — у отстающих: сыграли меньше
// всех в этой матрице. Блок рендерится у всех команд, пока турнир идёт.
updateTeamRests = () => {
  const now = Date.now();
  // минимум считается внутри каждой группы (таблицы) отдельно —
  // группы могут идти с разным прогрессом
  document.querySelectorAll('table.tournament-groups-table-games').forEach(table => {
    const rests = [...table.querySelectorAll('.team-rest')];
    if (rests.length === 0) return;
    const played = rests.map(el => parseInt(el.querySelector('.team-rest-played').textContent, 10));
    const minutes = rests.map(el => {
      const start = new Date(el.dataset.restStart).getTime();
      return Math.max(0, Math.floor((now - start) / 60000));
    });
    const minPlayed = Math.min(...played);
    rests.forEach((el, i) => {
      el.querySelector('.team-rest-minutes').textContent = `${minutes[i]}'`;
      el.classList.toggle('rating-minus', played[i] === minPlayed);
    });
  });
};
updateTeamRests();
setInterval(updateTeamRests, 30000);

// аватары на табло матча: у каждого разряда своя группа игроков
// (МО — одиночный мужчина, ЖО — женщина, МП/ЖП/СП — пары), сервер
// берёт её из сеяния команды. Текущий разряд читается из
// .board-game-type-current; функция вызывается при каждом открытии
// модалки табло — когда смена текущего разряда появится в JS,
// её достаточно дёргать и после смены.
const updateBoardAvatars = (modal) => {
  const current = modal.querySelector('.board-game-type-current');
  const type = current ? current.textContent.trim() : '';
  modal.querySelectorAll('.board-avatars').forEach(row => {
    row.querySelectorAll('[data-type]').forEach(cell => {
      cell.hidden = cell.dataset.type !== type;
    });
  });
};
// восстановление текущего счёта при открытии табло: EJS рендерит стартовый
// счёт, а матч мог уже идти — добираем фактический из БД. Команда 1 слева
// (teamIds[0] → score_1), как при рендере; смена сторон — клиентская и
// живёт только в открытом табло. При ненулевом счёте кнопка смены сторон
// прячется — как при первом очке
const restoreBoardScores = (modal) => {
  const [teamId1, teamId2] = modal.id.match(/^tournament-groups-board-(\d+)-(\d+)$/)?.slice(1).map(Number) ?? [];
  if (!teamId1) return;
  $.get(`/api/games/current110?team_1_id=${teamId1}&team_2_id=${teamId2}`).then(game => {
    if (!game) return;
    const left = modal.querySelector('#board-score-l');
    const right = modal.querySelector('#board-score-r');
    left.textContent = game.score_1;
    right.textContent = game.score_2;
    const swap = modal.querySelector('.board-swap');
    if (swap && (game.score_1 !== 0 || game.score_2 !== 0)) swap.hidden = true;
  });
};
$(document).on('shown.bs.modal', '[id^="tournament-groups-board-"]', event => {
  updateBoardAvatars(event.currentTarget);
  // строки выше текущего разряда — уже сыгранные игры: серым (lib.js)
  markBoardPlayedTypes(event.currentTarget);
  restoreBoardScores(event.currentTarget);
});

// счёт матчей в ячейках матрицы: финишировавший матч — только итоговый
// счёт (вместо кнопки ▶ / ⏱️ у гостя); идущий — текущий счёт + небольшая
// кнопка возобновления под ним (открывает табло, матч не создаёт).
// Размеры колонки не меняются: счёт компактный, кнопка btn-sm.
// Один запрос на страницу; после закрытия табло перерисовываем —
// только что доигранный/возобновлённый матч сразу показывает счёт
const renderFinishedMatchScores = () => {
  $.get('/api/games/110/results').then(results => {
    // кнопка возобновления — только залогиненным (как ▶ в EJS);
    // флаг выставляет group.ejs на таблице матрицы
    const signedIn = document.querySelector('table.tournament-groups-table-games[data-signed-in="1"]') !== null;
    // dataset здесь не годится: data-team-1-id из-за цифры даёт ключ
    // "team-1Id" — читаем атрибуты напрямую
    const byPair = new Map((results || []).map(r => [`${r.team_1_id}-${r.team_2_id}`, r]));
    document.querySelectorAll('td.tournament-groups-table-game[data-team-1-id]').forEach(td => {
      const pair = `${td.getAttribute('data-team-1-id')}-${td.getAttribute('data-team-2-id')}`;
      const r = byPair.get(pair);
      if (!r) return; // матча нет — кнопка ▶ остаётся
      td.querySelectorAll('button, span').forEach(el => el.remove());
      const scoreEl = document.createElement('span');
      scoreEl.className = 'game-result-score';
      scoreEl.textContent = `${r.score_1}:${r.score_2}`;
      td.appendChild(scoreEl);
      if (!r.finished && signedIn) {
        const resume = document.createElement('button');
        resume.type = 'button';
        resume.className = 'btn btn-outline-success btn-sm game-result-resume';
        resume.title = 'Возобновить матч';
        resume.setAttribute('data-bs-toggle', 'modal');
        resume.setAttribute('data-bs-target', `#tournament-groups-board-${pair}`);
        resume.innerHTML = '<i class="bi bi-play"></i>';
        td.appendChild(resume);
      }
    });
  });
};
renderFinishedMatchScores();
$(document).on('hidden.bs.modal', '[id^="tournament-groups-board-"]', () => renderFinishedMatchScores());
