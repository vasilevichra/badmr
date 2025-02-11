const renderTournaments = () => {
  $('#tournament-table')
  .bootstrapTable({
    url: '/api/tournaments/', columns: [
      {
        field: 'id',
        title: 'ID',
        align: 'center'
      },
      {
        field: 'name',
        title: 'Название турнира',
        align: 'center'
      },
      {
        field: 'current',
        title: 'Текущий',
        radio: true
      },
      {
        field: 'available',
        title: 'Доступен?',
        checkbox: true
      }]
  });
}