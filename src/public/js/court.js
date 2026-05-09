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
        formatter: (value, row) => {
          return row.available ?
              `<div class="btn bi bi-trash3" onclick="if (confirm('Удалить корт №${row.number}?')){ $.post('/api/courts/delete/${row.id}'); refresh.table.court(); }"></div>` :
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
}