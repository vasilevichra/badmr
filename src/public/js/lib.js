const scrollToId = (id) => {
  $('html,body').animate({scrollTop: $("#" + id).offset().top}, 'slow');
}

const age = (date) => {
  const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.2425;
  const [day, month, year] = date.split('.');
  return Math.floor((new Date().getTime() - new Date(+year, +month - 1, +day).getTime()) / MS_PER_YEAR);
}

const isPhone = () => {
  return !isNotPhone();
}

const isNotPhone = () => {
  let details = new UserAgent().parse(navigator.userAgent);
  return details.isDesktop || details.isTablet || details.isSmartTV;
}

const playerSexStyle = (sex) => {
  return sex ?
      {css: {"white-space": "nowrap", "background-color": "rgba(100,149,237,0.13)"}} :
      {css: {"background-color": "rgba(250,218,221,0.33)"}};
}

const playerRatingGroupsFormatter = (rating, B_max, C_max, D_max, E_max, F_max, G_max, H_max) => {
  let group;
  let rate;
  if (rating <= H_max) {
    group = 'H';
    rate = 0 + ' - ' + H_max;
  } else if (rating <= G_max) {
    group = 'G';
    rate = (H_max + 1) + ' - ' + G_max;
  } else if (rating <= F_max) {
    group = 'F';
    rate = (G_max + 1) + ' - ' + F_max;
  } else if (rating <= E_max) {
    group = 'E';
    rate = (F_max + 1) + ' - ' + E_max;
  } else if (rating <= D_max) {
    group = 'D';
    rate = (E_max + 1) + ' - ' + D_max;
  } else if (rating <= C_max) {
    group = 'C';
    rate = (D_max + 1) + ' - ' + C_max;
  } else if (rating <= B_max) {
    group = 'B';
    rate = (C_max + 1) + ' - ' + B_max;
  } else {
    group = 'A';
    rate = (B_max + 1) + '++';
  }

  return isPhone() ? rating : '<div title="' + group + ': ' + rate + '" class="group-letter"><div class="group-letter-bg secondary-info">'
      + group + '</div>' + rating + '</div>';
};

const playerRatingGroupsStyle = (rating, B_max, C_max, D_max, E_max, F_max, G_max, H_max) => {
  if (rating <= H_max) { // сделать запрос в базу с tournament_settings.H_max
    return {css: {"background-color": "rgba(255,255,255,0.33)"}};
  } else if (rating <= G_max) {
    return {css: {"background-color": "rgba(238,130,238,0.33)"}};
  } else if (rating <= F_max) {
    return {css: {"background-color": "rgba(75,0,130,0.33)"}};
  } else if (rating <= E_max) {
    return {css: {"background-color": "rgba(0,0,255,0.33)"}};
  } else if (rating <= D_max) {
    return {css: {"background-color": "rgba(0,128,0,0.33)"}};
  } else if (rating <= C_max) {
    return {css: {"background-color": "rgba(255,255,0,0.33)"}};
  } else if (rating <= B_max) {
    return {css: {"background-color": "rgba(255,165,0,0.33)"}};
  } else {
    return {css: {"background-color": "rgba(255,0,0,0.33)"}};
  }
}

const getText = (url) => {
  return $.ajax({
    type: 'GET',
    url: url,
    global: false,
    async: false,
    success: data => data
  }).responseText
};

const getJson = (url) => {
  return JSON.parse($.ajax({
    type: 'GET',
    url: url,
    dataType: 'json',
    global: false,
    async: false,
    success: data => data
  }).responseText);
}

const removeCharacterAtIndex = (value, index) => value.substring(0, index) + value.substring(index + 1);

const date2DatabaseFormat = (date = new Date()) => date.toISOString().replace('T', ' ').substring(0, 19);
