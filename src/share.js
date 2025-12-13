(exports => {

  const playerNameFormatter = (id, name, sex, pic, isMobile = false) => {
    let result = '';
    if (isMobile) {
      let names = name.split(/\s/);
      result = `${names[0]} ${names[1].charAt(0)}.`;
    } else {
      result = playerAvatarFormatter(pic, name, sex) + '&nbsp;' + name;
    }
    return result + '&nbsp;<nobr class="secondary-info">#' + id + '</nobr>';
  };

  const playerAvatarFormatter = (pic, name, sex) => {
    return pic ?
        '<img src="data:image/png;base64, ' + pic + '" alt="' + name + '" width="30" height="30"/>' :
        (sex ? '👨🏻‍🦰' : '👩🏻');
  };

  exports.playerNameFormatter = playerNameFormatter;

})(typeof exports === 'undefined' ? this['share'] = {} : exports);