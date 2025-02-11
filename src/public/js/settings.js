const renderSettings = () => {
  $('#settings-table')
  .bootstrapTable({
    url: '/api/settings/', columns: [
      {
        field: 'name',
        title: 'Название',
        align: 'center'
      },
      {
        field: 'value',
        title: 'Значение',
        align: 'center'
      },
      {
        field: 'description',
        title: 'Описание'
      }
    ]
  });
}