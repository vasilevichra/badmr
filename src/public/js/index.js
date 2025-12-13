$(document).ready(() => {

  // русская локализация для всех таблиц
  $.extend($.fn.bootstrapTable.defaults, $.fn.bootstrapTable.locales['ru-RU']);

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

  // выравнивание перелистывания страниц по центру для всех таблиц
  $('.fixed-table-pagination').addClass('d-flex justify-content-center');
});
