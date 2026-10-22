// селектор справочника (страны/регионы/города) для настройки, value — текущее значение (id).
// Если value нет в отфильтрованном каскадом списке — показывается пустой вариант
const referenceSelector = (name, rows, value) => {
  const options = rows.map((r) => `<option value="${r.id}"${String(r.id) === String(value) ? ' selected' : ''}>${r.text}</option>`);
  if (value && rows.length && !rows.some((r) => String(r.id) === String(value))) {
    options.unshift('<option value="" selected>—</option>');
  }
  return `<select data-name="${name}" class="settings-reference-select form-select form-select-sm text-center">${options.join('')}</select>`;
};

const renderSettings = () => {
  // значения настроек (обновляются при каждой отрисовке строк)
  const values = {};
  // справочники: state — все страны, region — по стране, city — по региону;
  // timezone — пояса выбранной страны (id из таблицы timezone) со смещением UTC
  const tzLabel = (tz) => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {timeZone: tz, timeZoneName: 'shortOffset'}).formatToParts(new Date());
      const offset = (parts.find((p) => p.type === 'timeZoneName') || {}).value || '';
      return offset ? `${tz} (UTC${offset.replace('GMT', '')})` : tz;
    } catch {
      return tz;
    }
  };
  const refs = {
    state: [],
    region: [],
    city: [],
    // type — тип соревнований из таблицы tournament_type;
    // priority — поля порядка подбора из таблицы ready_priority;
    // timezone — пояса, доступные в выбранной стране (выводятся из регионов)
    type: [],
    priority: [],
    timezone: [],
  };

  // пояса выбранной страны: уникальные пояса (id из таблицы timezone) её регионов
  const updateTimezones = () => {
    refs.timezone = refs.region
        .filter((r) => r.timezone_id)
        .filter((r, i, arr) => arr.findIndex((x) => x.timezone_id === r.timezone_id) === i)
        .map((r) => ({id: r.timezone_id, text: tzLabel(r.timezone)}))
        .sort((a, b) => a.text.localeCompare(b.text));
  };

  // ограничения значений из схемы БД (CHECK нижних границ defaults
  // и триггеры перекрёстных ограничений); селекторы шлют валидные id
  const integerMin = {delta: 0, proc: 0, matches: 0, wins: 1, game_point: 1, max_point: 1, capacity: 1, courts: 1};
  const positive = {fee: 0, B_max: 0, C_max: 0, D_max: 0, E_max: 0, F_max: 0, G_max: 0, H_max: 0, r_min: 0};
  const greaterThan = {max_point: 'game_point', B_max: 'C_max', C_max: 'D_max', D_max: 'E_max', E_max: 'F_max', F_max: 'G_max', G_max: 'H_max'};
  // обратные стороны тех же пар: меньшая сторона не должна подняться до большей
  const notMore = {game_point: 'max_point', C_max: 'B_max', D_max: 'C_max', E_max: 'D_max', F_max: 'E_max', G_max: 'F_max', H_max: 'G_max', r_min: 'r_max'};
  const notLess = {r_max: 'r_min'};

  const validValue = (name, value) => {
    if (name === 'priority') {
      // список id из ready_priority через запятую, без повторов
      const ids = value.split(',');
      return /^[0-9]+(,[0-9]+)*$/.test(value) && ids.length === new Set(ids).size
          && ids.every((id) => refs.priority.some((r) => String(r.id) === id));
    }
    if (!/^\d+$/.test(value)) {
      return false;
    }
    const n = Number(value);
    if ((name in integerMin && n < integerMin[name]) || (name in positive && n <= positive[name])) {
      return false;
    }
    if (name in greaterThan && n <= Number(values[greaterThan[name]])) {
      return false;
    }
    if (name in notMore && n >= Number(values[notMore[name]])) {
      return false;
    }
    return !(name in notLess && n < Number(values[notLess[name]]));
  };

  // порядок сортировки: по селекту на каждое поле ready_priority; разряд можно
  // оставить пустым («—») — он выпадает из значения; выбор id, занятого другим
  // разрядом, меняет разряды местами
  // подписи полей в селектах — эмодзи вместо имён из ready_priority
  const priorityEmoji = {played: '🥵', matches: '🏸', diff: '⚖️', friends: '👫'};
  const prioritySelector = (value) => {
    const ids = String(value).split(',');
    const options = (selected) => `<option value=""${selected ? '' : ' selected'}>—</option>`
        + refs.priority.map((r) => `<option value="${r.id}"${String(r.id) === String(selected) ? ' selected' : ''}>${priorityEmoji[r.text] ?? r.text}</option>`).join('');
    return refs.priority.map((r, i) =>
        `<select class="settings-priority-select form-select form-select-sm text-center" style="width:auto;display:inline-block;margin-right:4px">${options(ids[i])}</select>`).join('');
  };

  // перечитывает справочник по родителю и перерисовывает таблицу
  const reloadReference = (name, parentId, done) => {
    const path = name === 'region' ? 'regions' : 'cities';
    $.getJSON(`/api/${path}/select/${parentId}`, ({results}) => {
      refs[name] = results;
      if (name === 'region') {
        updateTimezones();
      }
      refresh.table.settings();
      if (done) {
        done(results);
      }
    });
  };

  $.getJSON('/api/settings/', (rows) => {
    rows.forEach((r) => values[r.name] = String(r.value));

    // начальные списки — уже отфильтрованные по текущим значениям
    Promise.all([
      $.getJSON('/api/states/select/'),
      $.getJSON('/api/tournament-types/select/'),
      $.getJSON('/api/ready-priorities/select/'),
      values.state ? $.getJSON(`/api/regions/select/${values.state}`) : Promise.resolve({results: []}),
      values.region ? $.getJSON(`/api/cities/select/${values.region}`) : Promise.resolve({results: []}),
    ]).then(([stateList, types, priorities, regions, cities]) => {
      refs.state = stateList.results;
      refs.type = types.results;
      refs.priority = priorities.results;
      refs.region = regions.results;
      refs.city = cities.results;
      updateTimezones();

      $('#settings-table')
      .bootstrapTable({
        url: '/api/settings/',
        columns: [
          {
            field: 'name',
            title: isPhone() ? 'Наз.' : 'Название',
            align: 'center'
          },
          {
            field: 'value',
            title: isPhone() ? 'Зн.' : 'Значение',
            align: 'center',
            // значение редактируется по клику и сохраняется в tournament_settings;
            // для state/region/city — селекторы, привязанные каскадом: регион к стране, город к региону
            formatter: (value, row) => {
              values[row.name] = String(value);
              if (row.name === 'state') {
                return referenceSelector('state', refs.state, value);
              }
              if (row.name === 'region') {
                return referenceSelector('region', refs.region, value);
              }
              if (row.name === 'city') {
                return referenceSelector('city', refs.city, value);
              }
              if (row.name === 'priority') {
                return prioritySelector(value);
              }
              if (row.name === 'timezone') {
                return referenceSelector('timezone', refs.timezone, value);
              }
              if (row.name === 'type') {
                return referenceSelector('type', refs.type, value);
              }
              // Система 50%: выключатель вместо текстового ввода
              if (row.name === 'fifty') {
                return `<input type="checkbox" class="settings-fifty-input form-check-input" ${String(value) === '1' ? 'checked' : ''}/>`;
              }
              return value;
            },
            cellStyle: () => ({css: {cursor: 'pointer'}})
          },
          {
            field: 'description',
            title: 'Описание'
          }
        ]
      })
      .on('click-cell.bs.table', (e, field, value, row, cell) => {
        if (field !== 'value' || $(cell).find('input, select').length) {
          return;
        }

        const save = (input) => {
          const newValue = String(input.val()).trim();
          input.off('blur keydown');
          if (newValue && newValue !== String(row.value) && validValue(row.name, newValue)) {
            // delta и proc влияют на расчёт подбора: показанные пары
            // устаревают — сбрасываем подбор
            const affectsReady = ['delta', 'proc'].includes(row.name);
            $.post(`/api/settings/${row.name}`, {value: newValue}, () => {
              refresh.table.settings();
              if (affectsReady) {
                showSelectButton(true);
              }
            });
          } else {
            refresh.table.settings(); // вернуть исходное значение (пустое, неизменённое или нарушающее ограничения)
          }
        };

        $(cell).html(`<input class="settings-value-input form-control form-control-sm text-center" type="text" value="${row.value}"/>`);
        const input = $(cell).find('input');
        input.trigger('focus').trigger('select');
        input.on('blur', () => save(input));
        input.on('keydown', (ev) => {
          if (ev.key === 'Enter') {
            save(input);
          }
          if (ev.key === 'Escape') {
            input.off('blur');
            refresh.table.settings();
          }
        });
      })
      // сохранение страны/региона/города сразу при выборе и пересборка зависимых селекторов
      .on('change', '.settings-reference-select', function () {
        const name = this.dataset.name;
        const value = this.value;
        if (!value) {
          return; // пустой вариант «—» не сохраняется
        }
        $.post(`/api/settings/${name}`, {value: value}, () => {
          if (name === 'state') {
            reloadReference('region', value, () => {
              // город привязан к региону: если выбранный регион не входит в новую страну,
              // список городов сбрасывается до явного выбора
              if (!refs.region.some((r) => String(r.id) === values.region)) {
                refs.city = [];
                refresh.table.settings();
              } else {
                reloadReference('city', values.region);
              }
            });
          } else if (name === 'region') {
            // соответствующий часовой пояс региона (id из таблицы timezone) подставляется в настройку timezone
            const region = refs.region.find((r) => String(r.id) === String(value));
            if (region && region.timezone_id && String(region.timezone_id) !== values.timezone) {
              values.timezone = String(region.timezone_id);
              $.post('/api/settings/timezone', {value: region.timezone_id}, () => refresh.table.settings());
            }
            reloadReference('city', value);
          } else {
            // остальные селекторы (city, timezone, type) не каскадятся
            refresh.table.settings();
          }
        });
      })
      // Система 50%: переключатель влияет на расчёт подбора — после
      // сохранения сбрасываем показанные пары
      .on('change', '.settings-fifty-input', function () {
        $.post('/api/settings/fifty', {value: this.checked ? '1' : '0'}, () => {
          refresh.table.settings();
          showSelectButton(true);
        });
      })
      // порядок сортировки: запоминаем прежнее значение разряда для обмена
      .on('focusin', '.settings-priority-select', function () {
        this.dataset.prev = this.value;
      })
      .on('change', '.settings-priority-select', function () {
        const selects = $(this).closest('td').find('.settings-priority-select');
        const prev = this.dataset.prev ?? this.value;
        // id, занятый другим разрядом, меняется с ним местами
        selects.not(this).each((i, el) => {
          if (el.value === this.value && this.value) {
            el.value = prev;
          }
        });
        // пустые разряды («—») выпадают из значения
        const order = selects.map((i, el) => el.value).get().filter(Boolean).join(',');
        if (order && validValue('priority', order)) {
          // порядок приоритетов влияет на расчёт подбора — сбрасываем пары
          $.post('/api/settings/priority', {value: order}, () => {
            refresh.table.settings();
            showSelectButton(true);
          });
        } else {
          refresh.table.settings(); // вернуть исходное значение
        }
      });
    });
  });
}
