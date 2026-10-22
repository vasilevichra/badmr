(exports => {

  const playerNameFormatter = (id, name, sex, pic, isMobile = false) => {
    if (isMobile) {
      const names = name.split(/\s/);
      name = `${names[0]} ${names[1].charAt(0)}.`;
    }

    return `<span class="no-selection text-nowrap">${playerAvatarFormatter(pic, name, sex)}&nbsp;${name}` + (isMobile ? '</span>' : `<span class="secondary-info">&nbsp;#<span class="user-id">${id}</span></span></span>`);
  };

  const playerAvatarFormatter = (pic, name, sex) => {
    // в БД аватар — data-URL (base64, в т.ч. из user_lab.img), либо http-ссылка,
    // либо «сырой» base64 из user_pic.pic
    const src = pic && (pic.startsWith('http') || pic.startsWith('data:')) ? pic : 'data:image/png;base64, ' + pic;
    return pic ?
        `<img class="no-selection" src="${src}" alt="${name}" width="20" height="20"/>` :
        `<span class="no-selection" style="font-size: 15px">${(sex ? '👨🏻‍🦰' : '👩🏻')}</span>`;
  };

  exports.playerNameFormatter = playerNameFormatter;

})(typeof exports === 'undefined' ? this['share'] = {} : exports);