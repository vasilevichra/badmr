$(document).ready(function () {

  // window.onbeforeunload = () => 'Are you sure you want to leave?';

  renderTournaments();
  renderSettings();
  renderCourts();
  renderPlayers();
  renderSelect();
  renderGames();
  renderArchive();

  // выравнивание перелистывания страниц по центру для всех таблиц
  $('.fixed-table-pagination').addClass('d-flex justify-content-center');
});
