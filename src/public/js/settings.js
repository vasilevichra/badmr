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
    // type — тип соревнований из таблицы tournament_type (только отображение:
    // настройка нередактируемая);
    // timezone — пояса, доступные в выбранной стране (выводятся из регионов)
    type: [],
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

  // ограничения значений из схемы БД (CHECK нижних границ
  // и триггеры перекрёстных ограничений); селекторы шлют валидные id
  const integerMin = {delta: 0, proc: 0, matches: 0, wins: 1, game_point: 1, max_point: 1, capacity: 1, courts: 1,
    rematch_window: 0, delta_auto_window: 0, delta_auto_lower: 0, delta_auto_upper: 0};
  const positive = {fee: 0, B_max: 0, C_max: 0, D_max: 0, E_max: 0, F_max: 0, G_max: 0, H_max: 0, r_min: 0};
  const greaterThan = {max_point: 'game_point', B_max: 'C_max', C_max: 'D_max', D_max: 'E_max', E_max: 'F_max', F_max: 'G_max', G_max: 'H_max'};
  // обратные стороны тех же пар: меньшая сторона не должна подняться до большей
  const notMore = {game_point: 'max_point', C_max: 'B_max', D_max: 'C_max', E_max: 'D_max', F_max: 'E_max', G_max: 'F_max', H_max: 'G_max', r_min: 'r_max'};
  const notLess = {r_max: 'r_min'};

  const validValue = (name, value) => {
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
      values.state ? $.getJSON(`/api/regions/select/${values.state}`) : Promise.resolve({results: []}),
      values.region ? $.getJSON(`/api/cities/select/${values.region}`) : Promise.resolve({results: []}),
    ]).then(([stateList, types, regions, cities]) => {
      refs.state = stateList.results;
      refs.type = types.results;
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
              if (row.name === 'timezone') {
                return referenceSelector('timezone', refs.timezone, value);
              }
              // тип соревнований нередактируемый: показываем название из справочника
              if (row.name === 'type') {
                const type = refs.type.find((r) => String(r.id) === String(value));
                return type ? type.text : value;
              }
              // выключатели (Система 50%, автоподстройка дельты) — чекбоксы
              if (row.name === 'fifty' || row.name === 'delta_auto') {
                return `<input type="checkbox" class="settings-boolean-input form-check-input" data-name="${row.name}" ${String(value) === '1' ? 'checked' : ''}/>`;
              }
              return value;
            },
            cellStyle: () => ({css: {cursor: 'pointer'}})
          },
          {
            field: 'description',
            // на телефоне название короче, а текст описания — в подсказке
            // у иконки с информацией
            title: isPhone() ? 'Опис.' : 'Описание',
            formatter: (value) => {
              if (!isPhone()) {
                return value;
              }
              return value
                  ? `<i class="bi bi-info-circle settings-description" title="${
                      String(value).replaceAll('"', '&quot;')
                  }"></i>`
                  : '';
            }
          }
        ]
      })
      .on('click-cell.bs.table', (e, field, value, row, cell) => {
        if (field !== 'value' || $(cell).find('input, select').length) {
          return;
        }
        // тип соревнований нередактируемый
        if (row.name === 'type') {
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
      // выключатели (Система 50%, автоподстройка дельты) влияют на расчёт
      // подбора — после сохранения сбрасываем показанные пары
      .on('change', '.settings-boolean-input', function () {
        $.post(`/api/settings/${this.dataset.name}`, {value: this.checked ? '1' : '0'}, () => {
          refresh.table.settings();
          showSelectButton(true);
        });
      });
    });
  });
}
