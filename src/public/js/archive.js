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
        title: '🏸',
        align: 'center',
        formatter: (value, row) => {
          return `<button type="button" class="btn btn-sm btn-outline-success" onclick="unarchiveUser(${row.id}, '${row.name}')"><i class="bi bi-arrow-bar-up"></i></button>`;
        },
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
  });
}