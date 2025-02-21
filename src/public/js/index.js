// const host = window.location.host;
// const port = window.location.port;

$(document).ready(function () {

  // window.onbeforeunload = () => 'Are you sure you want to leave?';

  renderTournaments();
  renderSettings();
  renderCourts();
  renderPlayers();
  renderSelect();
  renderMatches();
});

