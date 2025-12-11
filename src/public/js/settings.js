const renderSettings = () => {
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
        align: 'center'
      },
      {
        field: 'description',
        title: 'Описание'
      }
    ]
  });
}
