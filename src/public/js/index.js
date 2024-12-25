$(document).ready(function () {
  $('.header').height($(window).height());

  $(".navbar a").click(function () {
    $("body,html").animate({scrollTop: $("#" + $(this).data('value')).offset().top}, 100)
  });

  $('#tournament-table').bootstrapTable({
    url: 'http://127.0.0.1:3000/courts',
    striped: true,
    editable: true,
    columns: [{
      field: 'number',
      title: 'Название корта'
    }]
  });

  $('#player-table').bootstrapTable({
    columns: [
      {
        field: 'id',
        title: 'ID'
      },
      {
        field: 'lastname',
        title: 'Фамилия'
      },
      {
        field: 'firstname',
        title: 'Имя'
      },
      {
        field: 'patronomic',
        title: 'Отчество'
      },
      {
        field: 'sex',
        title: 'Пол'
      },
    ],
    url: 'http://127.0.0.1:3000/api/users/'
  });

})


