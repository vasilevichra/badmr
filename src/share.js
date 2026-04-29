(exports => {

  const playerNameFormatter = (id, name, sex, pic, isMobile = false) => {
    let result = '';
    if (isMobile) {
      let names = name.split(/\s/);
      result = `${names[0]} ${names[1].charAt(0)}.`;
    } else {
      result = playerAvatarFormatter(pic, name, sex) + '&nbsp;' + name;
    }
    return `<span class="no-selection">${result}&nbsp;</span><nobr class="secondary-info no-selection">#${id}</nobr>`;
  };

  const playerAvatarFormatter = (pic, name, sex) => {
    return pic ?
        `<img class="no-selection" src="${pic.startsWith('https://') ? pic : 'data:image/png;base64, ' + pic }" alt="${name}" width="20" height="20"/>` :
        `<span class="no-selection" style="font-size: 15px">${(sex ? '👨🏻‍🦰' : '👩🏻')}</span>`;
  };

  exports.playerNameFormatter = playerNameFormatter;

})(typeof exports === 'undefined' ? this['share'] = {} : exports);