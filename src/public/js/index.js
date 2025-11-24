$(document).ready(function () {

  // window.onbeforeunload = () => 'Are you sure you want to leave?';

  renderTournaments();
  renderSettings();
  renderCourts();
  renderPlayers();
  renderSelect();
  renderGames();
  renderArchive();

  if (loggedInUser) {
    // кнопка добавления нового пользователя у таблицы игроков
    $('.player .fixed-table-toolbar .columns').append(
        '<button type="button" class="btn bi-person-add btn-success" data-bs-toggle="modal" data-bs-target="#player-signup-window"></button>'
    );
  }

  // выравнивание перелистывания страниц по центру для всех таблиц
  $('.fixed-table-pagination').addClass('d-flex justify-content-center');
});
