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