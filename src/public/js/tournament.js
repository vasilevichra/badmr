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
        title: isPhone() ? 'Турнир' : 'Название турнира',
        align: 'center'
      },
      {
        field: 'current',
        title: 'Текущий?',
        radio: true
      },
      {
        field: 'available',
        title: 'Доступен?',
        checkbox: true
      }
    ].filter(column => isPhone() ? !['id'].includes(column.field) : true)
  });
}

$('#tournament-add-select-type').select2({
  placeholder: 'Выберите тип турнира',
  ajax: {
    url: '/api/tournament-types/select',
    dataType: 'json',
  },
  dropdownParent: $('#tournament-add'),
  dropdownAutoWidth: true,
  width: '100%',
  theme: "bootstrap-5",
  minimumResultsForSearch: -1,
});