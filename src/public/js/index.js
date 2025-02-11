// const host = window.location.host;
// const port = window.location.port;

$(document).ready(function () {

  // window.onbeforeunload = () => 'Are you sure you want to leave?';

  $(".navbar a").click(function () {
    $("body,html").animate({scrollTop: $("#" + $(this).data('value')).offset().top}, 100)
  });

  renderTournaments();
  renderSettings();
  renderCourts();
  renderPlayers();
  renderSelect();
  renderMatches();
});

