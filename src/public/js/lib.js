const csrfToken = () => $('meta[name="csrf-token"]').attr('content');

// id просматриваемого турнира (атрибут data-tournament на body);
// пусто на страницах без турнира (например, 404) — параметр не добавляется
const tournamentId = () => document.body.dataset.tournament || '';

// статус турнира (атрибут data-tournament-status на body) или undefined,
// если страницы без турнира
const tournamentStatus = () => {
  const s = document.body.dataset.tournamentStatus;
  return s === undefined || s === '' ? undefined : Number(s);
};

// добавляет ?tournament=<id> к read-URL раздела, если турнир задан;
// write-запросы параметр не получают: мутации идут по глобальному current
const withTournament = (url) => {
  const id = tournamentId();
  return id ? `${url}${url.includes('?') ? '&' : '?'}tournament=${id}` : url;
};


$.ajaxSetup({
  beforeSend: (xhr) => xhr.setRequestHeader('CSRF-Token', csrfToken())
});

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

/** Открывает модальное окно игрока: загружает карточку /web/players/<id>
 *  (с ?tournament=<id> — матчи карточки по открытому турниру)
 *  в #player-window и рисует график рейтинга из /api/ratings/<id>.
 *  Адрес синхронизируется: в URL добавляется ?player=<id>, чтобы ссылкой
 *  можно было поделиться. */
const openPlayerWindow = (id) => {
  // привязка модалки к адресу (кнопки назад/вперёд тоже работают)
  const url = new URL(location.href);
  if (url.searchParams.get('player') !== String(id)) {
    url.searchParams.set('player', id);
    history.pushState({}, '', url);
  }

  // ?tab=<имя> и ?all=1 — вкладка карточки и раскрытие «За всё время»,
  // синхронизированные с адресом; прокидываются в запрос, чтобы карточка
  // открылась в том же виде, каким делится ссылка
  let cardUrl = withTournament(`/web/players/${id}`);
  const params = new URLSearchParams(location.search);
  if (params.get('tab')) {
    cardUrl += `${cardUrl.includes('?') ? '&' : '?'}tab=${encodeURIComponent(params.get('tab'))}`;
  }
  if (params.get('all') === '1') {
    cardUrl += `${cardUrl.includes('?') ? '&' : '?'}all=1`;
  }

  $.ajax({
        url: cardUrl,
        type: 'GET',
        cache: false,
        success: html => {
          $("#player-window").html(html);
          // getOrCreateInstance, а не new: при переходах игрок→соигрок модалка
          // уже показана, но у нового экземпляра свой _isShown=false и свой
          // backdrop — при закрытии крестиком удалялся только последний,
          // остальные .modal-backdrop оставались серым экраном
          bootstrap.Modal.getOrCreateInstance('#player-window').show();
        },
      }
  );

  $.ajax({
    type: 'GET',
    url: `/api/ratings/${id}`,
    async: true,
    success: data => new Chart(document.getElementById('player-window-rating').getContext('2d'), {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Рейтинг',
          data: data,
          showLine: true,
          lineTension: 0.3,
          borderColor: 'rgb(13, 110, 253)'
        }],
      },
      options: {
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'month',
              displayFormats: {
                month: 'MMM yyyy'
              }
            }
          },
          y: {}
        }
      }
    }),
  });
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

  return isPhone() ? (rating || `<math><mo>&minus;</mo></math>`) : '<div title="' + group + ': ' + rate
      + '" class="group-letter"><div class="group-letter-bg secondary-info">'
      + group + '</div>' + (rating || '<math><mo>&minus;</mo></math>') + '</div>';
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

const date2DatabaseFormat = (date = new Date()) => date.toISOString().replace('T', ' ').substring(0, 19);

const increaseBoardScore = (el, team_1_id, team_2_id, team_number) => {
  // матч до 110 очков: дальше счёт не увеличивается
  if (parseInt(el.textContent) >= 110) return;
  let increasedValue = parseInt(el.textContent) + 1;
  el.textContent = increasedValue;
  $.post(`/api/games/current110/increase?team_1_id=${team_1_id}&team_2_id=${team_2_id}&team_number=${team_number}`);
  // кнопка смены сторон видна только при 0:0
  const modal = el.closest('.modal');
  const swap = modal.querySelector('.board-swap');
  if (swap) swap.hidden = true;
  // очко набрано лидером матча (у кого строго больше очков) — от этого
  // зависят автосмена сторон и завершение партии на кратном 11 счёте
  const opponent = modal.querySelector(el.id === 'board-score-l' ? '#board-score-r' : '#board-score-l');
  const opponentScore = parseInt(opponent.textContent);
  const scoredByLeader = increasedValue > opponentScore;
  // автоматическая смена сторон: порог 6, 17, 28 … 105 (6 + 11k), набранный
  // лидером; при равном счёте и при доборе догоняющей смены нет. Каждый
  // порог лидер проходит один раз → до 10 смен за матч
  if (scoredByLeader && increasedValue % 11 === 6 && increasedValue < 110) {
    boardSwapNotice(modal);
    swapBoardSidesEl(modal);
  }
  if (increasedValue % 11 === 0) {
    // партия заканчивается, только когда кратный 11 счёт достигает лидер:
    // вспышка-анимация и сдвиг типа игры — только у него; догоняющая
    // команда, добравшаяся до того же кратного 11 счёта, партию не
    // закрывает (без анимации, автозачёта и сдвига типа игры); на 110
    // матч окончен — победитель всегда
    if (scoredByLeader || increasedValue === 110) flashPartyWin(el);
    // 110-е очко выигрывает матч: салют, корона над счётом, последняя
    // партия в списке — серым; без автозачёта и сдвига типа игры
    if (increasedValue === 110) {
      boardSalute(el);
      el.classList.add('winner');
      grayBoardLastType(el);
      return;
    }
    if (scoredByLeader) {
      // автозачёт: проигравший партию получает минимум 5 очков за неё
      // (добор до 5×номер партии, как на сервере)
      opponent.textContent = Math.max(opponentScore, 5 * increasedValue / 11);
      advanceBoardGameType(el);
      // перевернуть табло
      // создать новую игру
      // убрать статус текущей у предыдущей
    }
  }
};

// салют при выигранном матче: лёгкие искры вокруг счёта, каждая
// разлетается по своему направлению и исчезает; на вёрстку не влияет
// (position: absolute, pointer-events: none)
const boardSalute = (el) => {
  const colors = ['#ffd700', '#ff4d4d', '#4da6ff', '#7dff7d', '#ff9de2'];
  for (let i = 0; i < 14; i++) {
    const spark = document.createElement('span');
    spark.className = 'board-spark';
    spark.style.background = colors[i % colors.length];
    const angle = Math.PI * 2 * i / 14 + Math.random() / 4;
    const distance = 9 + Math.random() * 9; // vh
    spark.style.setProperty('--dx', `${Math.cos(angle) * distance}vh`);
    spark.style.setProperty('--dy', `${Math.sin(angle) * distance}vh`);
    el.appendChild(spark);
    setTimeout(() => spark.remove(), 1300);
  }
};

// матч окончен на 110: текущая (последняя) партия списка — тоже
// сыгранная, серым; счёт текущим в списке больше не помечается
const grayBoardLastType = (el) => {
  const modal = el.closest('.modal');
  modal.querySelectorAll('.board-game-type-current').forEach(row => {
    row.classList.remove('board-game-type-current');
    row.classList.add('secondary-info');
  });
};

// смена сторон на табло: меняются местами имена, аватары, счёт (счёт
// команды продолжает идти за ней) и onclick счётов — целиком, потому
// что в нём зашит номер команды (team_number)
const swapBoardSidesEl = (modal) => {
  const left = modal.querySelector('#board-score-l');
  const right = modal.querySelector('#board-score-r');
  const names = modal.querySelectorAll('.board-team-name');
  [names[0].textContent, names[1].textContent] = [names[1].textContent, names[0].textContent];
  [left.textContent, right.textContent] = [right.textContent, left.textContent];
  const avatars = modal.querySelectorAll('.board-avatars');
  [avatars[0].innerHTML, avatars[1].innerHTML] = [avatars[1].innerHTML, avatars[0].innerHTML];
  const leftClick = left.getAttribute('onclick');
  left.setAttribute('onclick', right.getAttribute('onclick'));
  right.setAttribute('onclick', leftClick);
};

// ручная смена сторон (кнопка между названиями): доступна только при 0:0,
// кнопка прячется на первом очке. Повторные нажатия меняют стороны обратно
const swapBoardSides = (btn) => {
  const modal = btn.closest('.modal');
  const left = modal.querySelector('#board-score-l');
  const right = modal.querySelector('#board-score-r');
  if (parseInt(left.textContent) !== 0 || parseInt(right.textContent) !== 0) return;
  swapBoardSidesEl(modal);
};

// предупреждение о смене сторон: крупная надпись поверх табло на пару
// секунд; absolute + pointer-events: none — вёрстку не сдвигает
const boardSwapNotice = (modal) => {
  const notice = document.createElement('div');
  notice.className = 'board-swap-notice';
  notice.textContent = 'Смена сторон';
  modal.querySelector('.modal-content').appendChild(notice);
  setTimeout(() => notice.remove(), 2100);
};

// конец партии (счёт одной из сторон достиг 11/22/…/99): сдвигаем выбор
// типа игры на строку вниз по списку, разделитель «•» текущим не делаем.
// По новому типу переставляются аватары игроков (updateBoardAvatars из
// group.js — на момент события оба скрипта уже загружены).
const advanceBoardGameType = (el) => {
  const modal = el.closest('.modal');
  const current = modal && modal.querySelector('.board-game-type-current');
  if (!current) return;
  let next = current.nextElementSibling;
  while (next && !next.classList.contains('board-game-type')) next = next.nextElementSibling;
  if (next && next.textContent.trim() === '•') next = next.nextElementSibling;
  if (!next) return;
  current.classList.remove('board-game-type-current');
  next.classList.add('board-game-type-current');
  markBoardPlayedTypes(modal);
  if (typeof updateBoardAvatars === 'function') updateBoardAvatars(modal);
};

// уже сыгранные игры табло (строки выше текущей, без разделителя «•»)
// выделяем серым (secondary-info), текущая остаётся крупной и жирной
const markBoardPlayedTypes = (modal) => {
  const current = modal.querySelector('.board-game-type-current');
  if (!current) return;
  let row = current.previousElementSibling;
  while (row) {
    if (row.classList.contains('board-game-type') && row.textContent.trim() !== '•') {
      row.classList.add('secondary-info');
    }
    row = row.previousElementSibling;
  }
};

// окончание партии на табло: вспышка счёта + короткий сигнал
// (alert() требовал подтверждения и останавливал взаимодействие)
const flashPartyWin = (el) => {
  $(el).addClass('party-win');
  setTimeout(() => $(el).removeClass('party-win'), 1500);

  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.15, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.5);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
    oscillator.onended = () => context.close();
  } catch {
    // звук не критичен: без поддержки AudioContext остаётся вспышка
  }
};
const decreaseBoardScore = (el, team_1_id, team_2_id) => el.textContent = parseInt(el.textContent) - 1;

function handleScoreBoardGesture(el) {
  // if (touchendX < touchstartX) {
  //   console.log('Swiped Left');
  // }
  //
  // if (touchendX > touchstartX) {
  //   console.log('Swiped Right');
  // }

  if (touchendY < touchstartY) {
    console.log('Swiped Up');
    increaseBoardScore(el);
  }

  if (touchendY > touchstartY) {
    console.log('Swiped Down');
    decreaseBoardScore(el);
  }

  // if (touchendY === touchstartY) {
  //   console.log('Tap');
  // }
}

const addScoreBoardHandlers = (el) => {
  document.addEventListener('DOMContentLoaded', function () {
    el.addEventListener('touchstart', function (event) {
      touchstartX = event.changedTouches[0].screenX;
      touchstartY = event.changedTouches[0].screenY;
    }, false);
  });

  document.addEventListener('DOMContentLoaded', function () {
    el.addEventListener('touchend', function (event) {
      touchendX = event.changedTouches[0].screenX;
      touchendY = event.changedTouches[0].screenY;
      handleScoreBoardGesture(el);
    }, false);
  });
}

const winValue = (lostValue) => lostValue <= 19 ? 21 : (lostValue + 2);

const refresh = {
  block: {
    by: {
      id: (id) => $(`#${id}`).load(location.href + ` #${id}>*`, ''),
    },
    player: () => refresh.block.by.id('player'),
    select: () => refresh.block.by.id('select-block'),
  },
  table: {
    player: () => $('#player-table').bootstrapTable('refresh', {silent: true}),
    archive: () => $('#player-archive-table').bootstrapTable('refresh', {silent: true}),
    court: () => $('#cort-table').bootstrapTable('refresh', {silent: true}),
    settings: () => $('#settings-table').bootstrapTable('refresh', {silent: true}),
  }
}

const hide = {
  register: {
    __base: $('#tournament-new-registration-hint'),
    __func: (name) => hide.register.__base.find(`[name=${name}]`).closest('div').addClass('d-none').find('input[type=text]').val('').trigger('input'),
    all: () => hide.register.__base.find('.row div').each((i, e) => $(e).addClass('d-none').find('input[type=text]').val('')).trigger('input'),
    search: () => $('.tournament-new-registration-input').val('').closest('div.row').addClass('d-none'),
    user: {
      existed: {
        section: () => hide.register.__base.find('#tournament-new-existed-user').addClass('d-none'),
      },
    },
    lastname: () => hide.register.__func('ln'),
    firstname: () => hide.register.__func('fn'),
    patronymic: () => hide.register.__func('pn'),
    account: () => hide.register.__func('account'),
    rate: () => hide.register.__func('rate'),
  },
  player: {
    column: {
      paid: () => $('#player-table').bootstrapTable('hideColumn', 'paid'),
    }
  }
}

const show = {
  register: {
    __base: $('#tournament-new-registration-hint'),
    __func: (name, value) =>
        show.register.__base
        .find(`[name=${name}]`)
        .prop('size', value ? value.toString().length : 15)
        .prop('value', value)
        .closest('div.d-none')
        .removeClass('d-none'),
    user: {
      existed: {
        section: () => show.register.__base.find('#tournament-new-existed-user').removeClass('d-none'),
        addButton: () => show.register.__base.find('#tournament-new-add-existed-user').removeClass('d-none'),
      },
      new: {
        all: () => {
          show.register.all();
          show.register.user.new.regRstButton();
          hide.register.user.existed.section();
        },
        regAddButton: () => $('#tournament-new-registration-hint-reg-btn').closest('div.d-none').removeClass('d-none'),
        regRstButton: () => $('#tournament-new-registration-hint-reset-btn').removeClass('d-none'),
        regButtons: () => {
          show.register.user.new.regAddButton();
          show.register.user.new.regRstButton();
        },
      }
    },
    search: () => $('.tournament-new-registration-input').closest('div.row').removeClass('d-none'),
    all: () => show.register.__base.find('.row div.d-none').each((i, e) => $(e).removeClass('d-none')),
    lastname: (value) => show.register.__func('ln', value),
    firstname: (value) => show.register.__func('fn', value),
    patronymic: (value) => show.register.__func('pn', value),
    account: (value) => show.register.__func('account', value),
    rate: (value) => show.register.__func('rate', value),
    sex: (lastname, firstname, patronymic) => _.times(2, () => // костыль - иначе не работает
        $('#tournament-new-registration-hint-sex')
        .closest('div.d-none')
        .removeClass('d-none')
        .find('input')
        .prop('checked', new SexByRussianName(lastname, firstname, patronymic || '').get_gender())
    ),
  },
  player: {
    column: {
      delta_today: () => $('#player-table').bootstrapTable('showColumn', 'delta_today'),
    }
  }
}

const toggler = {
  toggle: (el) => {
    const closable = $(el).closest('div').nextAll('div.closable').first();
    if (closable.hasClass('d-none')) {
      toggler.show(closable);
    } else {
      toggler.hide(closable);
    }
  },
  hide: (closable) => {
    closable.addClass('d-none');
    closable.prev('div.row').find('.toggler').removeClass('bi-chevron-down').addClass('bi-chevron-up').css({'color': 'blue', '-webkit-text-stroke': '1px'});
    closable.next('hr').show();
    $.cookie(closable.attr('id'), false);
  },
  show: (closable) => {
    closable.removeClass('d-none');
    closable.prev('div.row').find('.toggler').removeClass('bi-chevron-up').addClass('bi-chevron-down').css({'color': '', '-webkit-text-stroke': ''});
    closable.next('hr').hide();
    $.cookie(closable.attr('id'), true);
  },
};

const capitalizeFirstLetter = (string) => {
  if (!string) {
    return '';
  }
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// [а-яёА-ЯЁ]: «ё» (U+0451) вне диапазона а-я — без него «Семён» режется до «Сем»
const parseName = (name) => name.match(/(?<lastname>[а-яёА-ЯЁ]+)?(\s+)?(?<firstname>[а-яёА-ЯЁ]+)?(\s+)?(?<patronymic>[а-яёА-ЯЁ]+)?/).groups;

/** Сброс query-параметров адреса без перезагрузки страницы
 *  (?player=<id>, ?tab=<имя>, ?all=1 после действий, их исчерпавших). */
const resetQuery = () => history.replaceState({}, '', location.pathname);

/** Показывает всплывающее уведомление (Bootstrap-тост) в правом нижнем углу.
 *  Используется глобальным обработчиком ajaxError для сообщений об ошибках. */
const showToast = (message, variant = 'danger') => {
  const toast = $(`
      <div class="toast align-items-center text-bg-${variant} border-0" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex">
          <div class="toast-body">${$('<div>').text(message).html()}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Закрыть"></button>
        </div>
      </div>`);

  $('#toast-container').append(toast);
  new bootstrap.Toast(toast, {delay: 6000}).show();
  toast.on('hidden.bs.toast', () => toast.remove());
};

/** Копирует текст в буфер обмена. navigator.clipboard доступен только в
 *  secure context, для остального — скрытая textarea с execCommand. */
const copyToClipboard = (text, onDone) => {
  const fallback = () => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      onDone();
    } finally {
      textarea.remove();
    }
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(onDone, fallback);
  } else {
    fallback();
  }
};

$(document).on('click', '.tournament-name-copy', function () {
  // текст шеры собран в data-share; {REG_LEFT} — скобка про регистрацию:
  // есть отсчёт (статус «Регистрация») → остаток в полных сутках или
  // «(сегодня)», если меньше суток; отсчёта нет → «(закончилась)»
  let text = String($(this).data('share'));
  const unitMillis = {d: 864e5, h: 36e5, m: 6e4, s: 1e3};
  const countdown = String($('#tournament-info time').not('.reg-end-since, .reg-end-since-badge').attr('datetime') || '');
  // datetime у отсчёта перезаписывается плагином countDown в ISO 8601
  // duration («P2DT23H25M8S»), пока не тикнуло — серверный формат
  // («2d 23h 25m 8s»); парсим оба, регистр не важен
  const units = countdown.match(/\d+[dhms]/gi) || [];
  const millis = units.reduce((acc, u) => acc + parseInt(u, 10) * unitMillis[u.slice(-1).toLowerCase()], 0);
  const days = Math.floor(millis / 864e5);
  const regLeft = countdown
      ? (days > 0 ? ` (осталось: ${days}д)` : ' (сегодня)')
      : ' (закончилась)';
  text = text.replace('{REG_LEFT}', regLeft);
  copyToClipboard(text, () => showToast('Информация о турнире скопирована', 'success'));
});

$(document).on('click', '.coords-copy', function () {
  copyToClipboard(String($(this).data('coords')), () => showToast('Координаты скопированы', 'success'));
});

/** Скачивает .ics (RFC 5545) с событием турнира: клик по кнопке в шапке
 *  открывает/сохраняет файл, календарное приложение импортирует событие.
 *  Время события в данных считается UTC — DTSTART/DTEND помечаются
 *  суффиксом Z, тайзона турнира не участвует. */
const addEventToCalendar = (button) => {
  const $button = $(button);
  // '2026-01-01 21:00:00' → '20260101T210000'
  const icsDate = (value) => String(value).replace(' ', 'T').replaceAll(/[-:]/g, '');
  const escapeIcs = (text) => String(text).replaceAll(/([,;\\])/g, '\\$1').replaceAll('\n', '\\n');

  const start = $button.data('start');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//badmr//Tournament//RU',
    'BEGIN:VEVENT',
    `UID:${Date.now()}@badmr`,
    // '2026-10-21T12:15:30.123Z' → '20261021T121530Z'
    `DTSTAMP:${new Date().toISOString().replaceAll(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${icsDate(start)}Z`
  ];
  const end = $button.data('end');
  if (end) {
    // у незавершённого турнира длительность не задана — DTEND опускается
    lines.push(`DTEND:${icsDate(end)}Z`);
  }
  lines.push(
      `SUMMARY:${escapeIcs($button.data('name'))}`,
      `LOCATION:${escapeIcs($button.data('location'))}`,
      'END:VEVENT',
      'END:VCALENDAR'
  );

  const blob = new Blob([lines.join('\r\n')], {type: 'text/calendar;charset=utf-8'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${String($button.data('name')).replaceAll(/[/\\:*?"<>|]/g, '_')}.ics`;
  link.click();
  URL.revokeObjectURL(link.href);
};

$(document).on('click', '.tournament-calendar', function () {
  addEventToCalendar(this);
});

// одна точка обработки ошибок AJAX: сервер отдаёт тело вида {error: message}
// (promise-мидлвара), при статусе 0 соединения не было вовсе.
// textStatus приходит 4-м аргументом; 'abort' — это не потеря связи, а
// осознанный обрыв запроса (перезагрузка страницы, refresh bootstrap-table)
$(document).ajaxError((event, xhr, settings, errorThrown) => {
  if (xhr.status === 0 && errorThrown !== 'abort') {
    showToast('Нет связи с сервером');
    return;
  } else if (xhr.status === 0) {
    return;
  }
  let message;
  try {
    message = JSON.parse(xhr.responseText).error;
  } catch {
    // тело не JSON — покажем статус
  }
  showToast(message || `Ошибка ${xhr.status}`);
});

/** Диалог подтверждения вместо window.confirm: bootstrap-модалка
 *  создаётся динамически, onConfirm вызывается только после «Удалить». */
const confirmAction = (message, onConfirm) => {
  $('#confirm-action-modal').remove();
  $('body').append(`
      <div class="modal fade" id="confirm-action-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-sm">
          <div class="modal-content">
            <div class="modal-body">${$('<div>').text(message).html()}</div>
            <div class="modal-footer py-2">
              <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Отмена</button>
              <button type="button" class="btn btn-danger btn-sm" id="confirm-action-ok">Удалить</button>
            </div>
          </div>
        </div>
      </div>`);

  const modal = new bootstrap.Modal('#confirm-action-modal');
  $('#confirm-action-ok').on('click', () => {
    modal.hide();
    onConfirm();
  });
  $('#confirm-action-modal').on('hidden.bs.modal', () => $('#confirm-action-modal').remove());
  modal.show();
};

/** «N г. N мес. N д. назад» для дат в прошлом — календарная разница дат
 *  без заимствования часов: другой день — уже «1 д. назад», даже если
 *  прошло меньше суток (окончание вчера в 17:00 сегодня утром — не
 *  «сегодня», а «1 д. назад»). */
const calendarPartsSince = (datetime) => {
  const end = new Date(datetime);
  if (isNaN(end.getTime())) {
    return [];
  }
  const now = new Date();

  let days = now.getDate() - end.getDate();
  let months = now.getMonth() - end.getMonth();
  let years = now.getFullYear() - end.getFullYear();
  if (days < 0) { months--; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (months < 0) { years--; months += 12; }

  const parts = [];
  if (years > 0) { parts.push(`${years} г.`); }
  if (months > 0) { parts.push(`${months} мес.`); }
  if (days > 0) { parts.push(`${days} д.`); }
  return parts;
};

/** Компактное «1сек»/«1мин»/«5ч»/«3д»/«4мес»/«3г» для красного бейджа
 *  телефона — только старшая единица. Дни — календарная разница дат,
 *  как в calendarPartsSince (без заимствования часов); в пределах одного
 *  календарного дня часы/минуты/секунды. */
const sinceCompact = (datetime) => {
  const end = new Date(datetime);
  if (isNaN(end.getTime())) {
    return '';
  }
  const now = new Date();

  let days = now.getDate() - end.getDate();
  let months = now.getMonth() - end.getMonth();
  let years = now.getFullYear() - end.getFullYear();
  if (days < 0) { months--; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (months < 0) { years--; months += 12; }

  if (years > 0) { return `${years}г`; }
  if (months > 0) { return `${months}мес`; }
  if (days > 0) { return `${days}д`; }

  // тот же календарный день — часы/минуты/секунды неотрицательны
  let secs = now.getSeconds() - end.getSeconds();
  let mins = now.getMinutes() - end.getMinutes();
  let hours = now.getHours() - end.getHours();
  if (secs < 0) { mins--; secs += 60; }
  if (mins < 0) { hours--; mins += 60; }
  if (hours > 0) { return `${hours}ч`; }
  if (mins > 0) { return `${mins}мин`; }
  return `${secs}сек`;
};
