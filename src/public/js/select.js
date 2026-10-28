const renderSelect = () => {
  $('#select-button').off('click').click((event) => {
    event.preventDefault();

    $('#select-button').hide();

    $.getJSON(withTournament("/api/common/ready/"), ready => {
      if (ready.join("").length) {
        // шанс пары («Шанс») считает сервер: win_rate совместных доигранных
        // матчей напарников входит в ответ ready() — chance1/chance2;
        // null — напарники ни разу не играли вместе (в таблице «—»)

        $.each(ready, i => {
          $(selectFormTemplate(i)).appendTo($('#select-block'));
        });

        $.each(ready, (i, field) => {
          let players1 = field.players1;
          let players2 = field.players2;

          // процент превышения среднего рейтинга пары одним из игроков
          const pairExcess = (players) => {
            const avg = (players[0].rating + players[1].rating) / 2;
            return (Math.max(players[0].rating, players[1].rating) / avg - 1) * 100;
          };
          players1.forEach((player) => {
            player.excess = pairExcess(players1);
          });
          players2.forEach((player) => {
            player.excess = pairExcess(players2);
          });

          // пол и аватар приходят прямо в ready() — отдельные запросы
          // за пользователем не нужны

          // шанс пары живёт в rowspan-ячейке первого игрока: 0 — вместе
          // играли, но ни одной совместной победы; null — не играли («—»)
          players1[0].chance = field.chance1;
          players2[0].chance = field.chance2;

          const table1 = $(`#select-form-table-1-${i}`);
          table1.bootstrapTable({
            data: field.players1,
            columns: selectColumns
          });
          // скрытия до mergeCells: hideColumn перерисовывает тело таблицы
          // и сбросил бы уже проставленные rowspan-ячейки.
          // «Сыграно» скрываем, пока пара ещё не сыграла ни одного матча;
          // «Шанс» виден всегда — без совместных матчей показывает «—»
          if (players1.every((player) => !player.matches)) {
            table1.bootstrapTable('hideColumn', 'matches');
          }
          table1.bootstrapTable('mergeCells', {index: 0, field: 'chance', rowspan: 2});
          table1.bootstrapTable('mergeCells', {index: 0, field: 'excess', rowspan: 2});
          bindMergedCellHover(table1);
          addPhoneColumnHints(table1);
          table1.on('click-cell.bs.table', (e, field, row, element) => {
            if (field === 'name') {
              openPlayerWindow(element.user_id);
            }
          });

          const table2 = $(`#select-form-table-2-${i}`);
          table2.bootstrapTable({
            data: field.players2,
            columns: selectColumns
          });
          if (players2.every((player) => !player.matches)) {
            table2.bootstrapTable('hideColumn', 'matches');
          }
          table2.bootstrapTable('mergeCells', {index: 0, field: 'chance', rowspan: 2});
          table2.bootstrapTable('mergeCells', {index: 0, field: 'excess', rowspan: 2});
          bindMergedCellHover(table2);
          addPhoneColumnHints(table2);
          table2.on('click-cell.bs.table', (e, field, row, element) => {
            if (field === 'name') {
              openPlayerWindow(element.user_id);
            }
          });
          // сильнейшая пара — с большей суммой рейтингов: её колонка красится
          // как rating-plus; при равенстве сумм сильнейшей считается вторая
          const stronger = field.players1.reduce((acc, p1) => acc + p1.rating, 0) >
            field.players2.reduce((acc, p2) => acc + p2.rating, 0) ? 1 : 2;
          if (stronger === 1) {
            $(`#select-form-table-1-${i} tbody tr td:nth-child(1)`).addClass('rating-plus');
            $(`#select-form-table-2-${i} tbody tr td:nth-child(1)`).addClass('rating-minus');
          } else {
            $(`#select-form-table-1-${i} tbody tr td:nth-child(1)`).addClass('rating-minus');
            $(`#select-form-table-2-${i} tbody tr td:nth-child(1)`).addClass('rating-plus');
          }

          // пометки в заголовке колонки «Имя»: слева название, у правого края —
          // дельта сильнейшей пары (+1.6) и значок фаворита; если обе в одном
          // заголовке — сначала дельта, через пробел значок
          const marks = {};
          // дельта сильнейшей пары в заголовке: на телефоне — целочисленная
          marks[stronger] = `<span class="select-delta">+${isPhone() ? Math.round(field.diff) : field.diff.toFixed(1)}</span>`;
          if (field.favorite === 1 || field.favorite === 2) {
            marks[field.favorite] = `${marks[field.favorite] ?? ''}<i class="bi bi-trophy-fill select-favorite"></i>`;
          }
          for (const [tableNum, html] of Object.entries(marks)) {
            const nameTh = $(`#select-form-table-${tableNum}-${i}`).find('thead th:first');
            nameTh.addClass('select-mark-th');
            nameTh.find('.th-inner').append(`<span class="select-marks">${html}</span>`);
          }
          $(`#select-form-button-submit-${i}`).off('click').click((event) => {
            event.preventDefault();

            // защита от двойной отправки: кнопка неактивна до ответа сервера
            const submitButton = $(`#select-form-button-submit-${i}`).prop('disabled', true);

            $.ajax({
              url: '/api/matches/create',
              type: 'POST',
              dataType: 'json',
              contentType: 'application/json; charset=utf-8',
              data: JSON.stringify({
                user_1_id: players1[0].user_id,
                user_2_id: players1[1].user_id,
                user_3_id: players2[0].user_id,
                user_4_id: players2[1].user_id
              }),
              success: function (result) {
                $(`#select-form-${i}`).hide();
                renderGames();
                showSelectButton();
              },
              complete: function () {
                // при ошибке форма остаётся, кнопка снова активна
                // (текст ошибки показывает глобальный обработчик ajaxError)
                submitButton.prop('disabled', false);
              }
            });
            refresh.table.player();
            refresh.table.court();
          });
          $(`#select-form-button-reset-${i}`).off('click').click((event) => {
            event.preventDefault();

            $(`#select-form-${i}`).hide();

            showSelectButton();
          });
        });

        if (isPhone()) {
          fitSelectTables();
          $(window).off('resize.selectFit').on('resize.selectFit', fitSelectTables);
        }
      } else {
        $('#select-info').show();
      }
    });
  });
}

// разметка формы подбора берётся из <template id="select-form-template"> (select-form.ejs),
// __i__ заменяется на номер формы
const selectFormTemplate = (counter) => $('#select-form-template').html().replaceAll('__i__', counter);

// наведение на смёрженную ячейку («Шанс»/«Разница»): гасим штатную
// подсветку строки первого игрока — rowspan-ячейка принадлежит его tr,
// и .table-hover красил бы всю строку, пока курсор над ячейкой
const bindMergedCellHover = (table) => {
  table.find('td[rowspan]')
  .on('mouseenter', () => table.addClass('cell-hover-only'))
  .on('mouseleave', () => table.removeClass('cell-hover-only'));
};

// подсказки над сокращёнными на телефоне названиями колонок; паддинги
// заголовков переключает CSS-класс .select-compact на таблице
const addPhoneColumnHints = (table) => {
  if (!isPhone()) {
    return;
  }
  const hints = {rating: 'Рейтинг', matches: 'Сыграно', chance: 'Шанс', excess: 'Разница'};
  for (const [field, hint] of Object.entries(hints)) {
    table.find(`thead th[data-field="${field}"] .th-inner`).attr('title', hint);
  }
};

// числовые колонки подбора: на телефоне шрифт адаптивный — тянется от
// ширины экрана: максимум 1rem (как в колонке «Имя»), на узких экранах
// сжимается (минимум 0.7rem); паддинги переключает CSS-класс .select-compact —
// его вешает fitSelectTables(), когда таблица не умещается на экране
const numberCellStyle = () => isPhone() ? {css: {'font-size': 'clamp(0.7rem, 3.8vw, 1rem)'}} : {};

// экран: таблицы подбора не умещаются — компактный режим на всех (паддинги
// вдвое меньше исходных); перепроверяем при повороте экрана и изменении
// размеров окна
const fitSelectTables = () => {
  const tight = document.body.scrollWidth > document.documentElement.clientWidth;
  $('.select-form-table-1, .select-form-table-2').toggleClass('select-compact', tight);
};

const selectColumns = [
  {
    field: 'name',
    title: 'Имя',
    // признак «Играл» — точка у аватара: зелёная — не играл, красная — играл
    formatter: (value, row) =>
        // индикация последнего матча: проиграл — красная точка, выиграл —
        // зелёная; отдыхал (played = 0) — без индикации
        (row.played ? `<span class="played-dot ${row.won ? 'played-dot-won' : 'played-dot-lost'}" title="${row.won ? 'Выиграл' : 'Проиграл'}"></span>` : '') +
        this.share.playerNameFormatter(row.user_id, value, row.sex, row.pic, isPhone()),
    cellStyle: (value, row) => playerSexStyle(row.sex)
  },
  {
    field: 'rating',
    title: isPhone() ? 'Р.' : 'Рейтинг',
    align: 'center',
    class: 'select-num',
    // на телефоне рейтинг целочисленный — без дробной части
    formatter: (value) => isPhone() ? Math.round(value) : value,
    cellStyle: numberCellStyle
  },
  {
    field: 'matches',
    title: isPhone() ? 'И.' : 'Сыграно',
    align: 'center',
    class: 'select-num',
    cellStyle: numberCellStyle,
    // выигранные матчи — зелёным, проигранные (всего минус выигранные) —
    // красным; когда есть и те и другие — с суммой сыгранных матчей,
    // при одной составляющей — только она, без матчей — «0»
    formatter: (value, row) => {
      if (!value) {
        return '0';
      }
      const wins = row.wins ?? 0;
      const lost = value - wins;
      if (isPhone()) {
        // компактный формат «победы поражения всего» с уменьшенным
        // пробелом-разделителем (thin space)
        return `<span class="rating-plus">${wins}</span>&#8201;<span class="rating-minus">${lost}</span>&#8201;${value}`;
      }
      if (!lost) {
        return `<span class="rating-plus">${value}</span>`;
      }
      if (!wins) {
        return `<span class="rating-minus">${value}</span>`;
      }
      return `<span class="rating-plus">${wins}</span> + <span class="rating-minus">${lost}</span> = ${value}`;
    }
  },
  {
    field: 'chance',
    title: isPhone() ? 'Ш.' : 'Шанс',
    align: 'center',
    class: 'select-num',
    cellStyle: numberCellStyle,
    // винрейт совместных доигранных матчей пары в процентах (из ответа
    // ready()); напарники ни разу не игравшие вместе — null, показываем «—»;
    // на телефоне — целочисленный, без дробной части
    formatter: (value) => value != null
        ? `${isPhone() ? Math.round(value) : value}${isPhone() ? '<span class="select-pct">%</span>' : '%'}`
        : '—'
  },
  {
    field: 'excess',
    title: isPhone() ? 'Δ' : 'Разница',
    align: 'center',
    class: 'select-num',
    cellStyle: numberCellStyle,
    formatter: (value) => isPhone()
        ? `${Math.round(value)}<span class="select-pct">%</span>`
        : `${value.toFixed(1)}%`
  }
];

const showSelectButton = (force) => {
  const info = $('#select-info');
  // force — безусловный сброс: изменение настроек, влияющих на подбор,
  // обесценивает уже показанные пары даже если все формы ещё видимы
  if (force || info.is(":visible") || $('.select-form-button-submit:visible').length === 0) {
    info.hide();
    $('.select-form').remove();
    $('#select-button').show();
  }
}
