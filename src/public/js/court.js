const renderCourts = () => {
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
      },
      {
        title: 'Удалить?',
        align: 'center',
        // удаление через делегированный обработчик ниже: без inline onclick
        // с интерполяцией и без window.confirm
        formatter: (value, row) => {
          return row.available ?
              `<div class="btn bi bi-trash3 court-delete" data-id="${row.id}" data-number="${row.number}" role="button" tabindex="0" aria-label="Удалить корт №${row.number}"></div>` :
              '<div class="bi bi-ban secondary-info no-selection"></div>';
        }
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

  // делегирование: строки таблицы перестраиваются при каждом refresh,
  // обработчик на самой таблице переживает перерисовку
  $('#cort-table').off('click', '.court-delete').on('click', '.court-delete', function () {
    const id = $(this).data('id');
    const number = $(this).data('number');
    confirmAction(`Удалить корт №${number}?`, () => $.post(`/api/courts/delete/${id}`, {}, () => refresh.table.court()));
  });
}
