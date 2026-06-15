(exports => {

  const playerNameFormatter = (id, name, sex, pic, isMobile = false) => {
    if (isMobile) {
      const names = name.split(/\s/);
      name = `${names[0]} ${names[1].charAt(0)}.`;
    }

    return `<span class="no-selection text-nowrap">${playerAvatarFormatter(pic, name, sex)}&nbsp;${name}` + (isMobile ? '</span>' : `<span class="secondary-info">&nbsp;#<span class="user-id">${id}</span></span></span>`);
  };

  const playerAvatarFormatter = (pic, name, sex) => {
    return pic ?
        `<img class="no-selection" src="${pic.startsWith('https://') ? pic : 'data:image/png;base64, ' + pic }" alt="${name}" width="20" height="20"/>` :
        `<span class="no-selection" style="font-size: 15px">${(sex ? '👨🏻‍🦰' : '👩🏻')}</span>`;
  };

  exports.playerNameFormatter = playerNameFormatter;

})(typeof exports === 'undefined' ? this['share'] = {} : exports);