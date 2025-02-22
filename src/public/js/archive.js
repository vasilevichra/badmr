const renderArchive = () => {
  $('#player-archive-table')
  .bootstrapTable({
    url: '/api/users/archived',
    // search: isNotPhone(),
    sortName: 'name',
    pagination: true,
    pageSize: 5,
    pageNumber: 1,
    paginationParts: ['pageList'],
    paginationPreText: '⟵',
    paginationNextText: '⟶',
    columns: [
      {
        field: 'archived',
        title: 'В архиве?',
        checkbox: true,
      },
      {
        field: 'name',
        title: 'Имя',
        sortable: true,
        formatter: (value, row) => playerNameFormatter(row.id, value, row.sex, row.pic)
      },
      {
        field: 'city',
        title: 'Город',
        align: 'center',
        sortable: true
      }
    ]
  })
  .on('uncheck-all.bs.table', () => {
    if (confirm("Сделать всех игроков активнымы?")) {
      $.post('/api/users/unarchive');
      $('#player-table').bootstrapTable('refresh');
    }
    $('#player-archive-table').bootstrapTable('refresh');
  })
  .on('uncheck.bs.table', (row, element) => {
    unarchiveUser(element.id, element.name);
  });
}