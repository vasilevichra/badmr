function scrollToId(id) {
  $('html,body').animate({scrollTop: $("#" + id).offset().top}, 'slow');
}