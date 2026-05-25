$(document).ready(() => {

  // скрытие блоков после перезагрузки страницы или логина
  $('.closable').each((i, el) => {
    if ($.cookie($(el).attr('id')) === 'false') {
      toggler.hide($(el));
    }
  });

  // подстановка значения в строку поиска для регистрации
  $('.tournament-new-registration-input').val($.cookie('registration-input')).trigger('input');

  // window.onbeforeunload = () => 'Are you sure you want to leave?';

  const settings = {
    B_max: () => Number(getText('/api/settings/B_max')),
    C_max: () => Number(getText('/api/settings/C_max')),
    D_max: () => Number(getText('/api/settings/D_max')),
    E_max: () => Number(getText('/api/settings/E_max')),
    F_max: () => Number(getText('/api/settings/F_max')),
    G_max: () => Number(getText('/api/settings/G_max')),
    H_max: () => Number(getText('/api/settings/H_max')),
  }

  renderTournaments();
  renderSettings();
  renderCourts();
  renderPlayers(settings.B_max(), settings.C_max(), settings.D_max(), settings.E_max(), settings.F_max(), settings.G_max(), settings.H_max());
  renderSelect();
  renderGames();
  renderArchive();
  renderGroups();

  // выравнивание перелистывания страниц по центру для всех таблиц
  $('.fixed-table-pagination').addClass('d-flex justify-content-center');

  // обработчики событий для табло
  ["board-score-l", "board-score-r"].map(id => document.getElementById(id)).map(el => addScoreBoardHandlers(el));

  // обновить рейтинг ЛАБ в фоне
  if (window.navigator.onLine) {
    $.ajax({
      url: '/api/users/lab',
      type: 'POST',
      cache: false,
      async: true,
      success: () => refresh.table.player(),
      error: () => {
      },
    });
  }
});
