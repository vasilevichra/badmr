const scrollToId = (id) => {
  $('html,body').animate({scrollTop: $("#" + id).offset().top}, 'slow');
}

const age = (date) => {
  const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.2425;
  const [day, month, year] = date.split('.');
  return Math.floor((new Date().getTime() - new Date(+year, +month - 1, +day).getTime()) / MS_PER_YEAR);
}

const isPhone = () => {
  return new MobileDetect(window.navigator.userAgent).phone() !== null;
}

const isNotPhone = () => {
  return !isPhone();
}

const playerNameFormatter = (id, name, sex, pic) => {
  let result = '';
  if (isPhone()) {
    let names = name.split(/\s/);
    result = `${names[0]} ${names[1].charAt(0)}.`;
  } else {
    result = playerAvatarFormatter(pic, name, sex) + ' ' + name;
  }
  return result + ' <nobr style="color: rgba(128,128,128,0.3)">#' + id + '</nobr>';
};

const playerAvatarFormatter = (pic, name, sex) => {
  return pic ?
      '<img src="data:image/png;base64, ' + pic + '" alt="' + name + '" width="30" height="30"/>' :
      (sex ? '👨🏻‍🦰' : '👩🏻');
};

const playerSexStyle = (sex) => {
  return sex ?
      {css: {"white-space": "nowrap", "background-color": "rgba(100,149,237,0.13)"}} :
      {css: {"background-color": "rgba(250,218,221,0.33)"}};
}

const playerRatingGroupsFormatter = (rating) => {
  let group;
  if (rating <= 250) { // сделать запрос в базу с tournament_settings.H_max
    group = 'H';
  } else if (rating <= 320) {
    group = 'G';
  } else if (rating <= 380) {
    group = 'F';
  } else if (rating <= 480) {
    group = 'E';
  } else if (rating <= 600) {
    group = 'D';
  } else if (rating <= 750) {
    group = 'C';
  } else if (rating <= 900) {
    group = 'B';
  } else {
    group = 'A';
  }

  return isPhone() ? rating : '<div class="group-letter"><div class="group-letter-bg">' + group + '</div>' + rating + '</div>';
};

const playerRatingGroupsStyle = (rating) => {
  if (rating <= 250) { // сделать запрос в базу с tournament_settings.H_max
    return {css: {"background-color": "rgba(255,255,255,0.33)"}};
  } else if (rating <= 320) {
    return {css: {"background-color": "rgba(238,130,238,0.33)"}};
  } else if (rating <= 380) {
    return {css: {"background-color": "rgba(75,0,130,0.33)"}};
  } else if (rating <= 480) {
    return {css: {"background-color": "rgba(0,0,255,0.33)"}};
  } else if (rating <= 600) {
    return {css: {"background-color": "rgba(0,128,0,0.33)"}};
  } else if (rating <= 750) {
    return {css: {"background-color": "rgba(255,255,0,0.33)"}};
  } else if (rating <= 900) {
    return {css: {"background-color": "rgba(255,165,0,0.33)"}};
  } else {
    return {css: {"background-color": "rgba(255,0,0,0.33)"}};
  }
}

function getJson(url) {
  return JSON.parse($.ajax({
    type: 'GET',
    url: url,
    dataType: 'json',
    global: false,
    async:false,
    success: function(data) {
      return data;
    }
  }).responseText);
}
