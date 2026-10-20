const renderArchive = () => {
  // раздел скрывается целиком — вместе с тогглером и разделителем, —
  // пока в архиве никого нет; видимость пересматривается при каждой
  // загрузке данных (в т.ч. silent-обновлении после архивирования)
  const archiveContainer = $('#player-archive').closest('.container').addClass('d-none');

  $('#player-archive-table')
  .bootstrapTable({
    url: '/api/users/archived',
    search: isNotPhone(),
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
        formatter: (value, row) => this.share.playerNameFormatter(row.id, value, row.sex, row.pic, isPhone())
      },
      {
        field: 'city',
        title: 'Город',
        align: 'center',
        sortable: true
      }
    ]
  })
  .on('load-success.bs.table', (event, data) => {
    archiveContainer.toggleClass('d-none', data.length === 0);
  });

  $('#player-archive div.fixed-table-toolbar').addClass('d-flex justify-content-center');
}
