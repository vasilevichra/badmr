const csrfToken = () => $('meta[name="csrf-token"]').attr('content');

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

  $.ajax({
        url: `/web/players/${id}`,
        type: 'GET',
        cache: false,
        success: html => {
          $("#player-window").html(html);
          // модалка показывается после загрузки карточки — sync-запрос
          // здесь замораживал интерфейс на время загрузки
          new bootstrap.Modal('#player-window').show();
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
  let increasedValue = parseInt(el.textContent) + 1;
  el.textContent = increasedValue;
  $.post(`/api/games/current110/increase?team_1_id=${team_1_id}&team_2_id=${team_2_id}&team_number=${team_number}`);
  if (increasedValue % 11 === 0) {
    kva(el);
    // перевернуть табло
    // создать новую игру
    // убрать статус текущей у предыдущей
  }
};

// окончание партии на табло: вспышка счёта + короткий сигнал
// (alert() требовал подтверждения и останавливал взаимодействие)
const kva = (el) => {
  $(el).addClass('kva');
  setTimeout(() => $(el).removeClass('kva'), 1500);

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

const parseName = (name) => name.match(/(?<lastname>[а-яА-Я]+)?(\s+)?(?<firstname>[а-яА-Я]+)?(\s+)?(?<patronymic>[а-яА-Я]+)?/).groups;

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
  copyToClipboard(String($(this).data('name')), () => showToast('Название скопировано', 'success'));
});

$(document).on('click', '.coords-copy', function () {
  copyToClipboard(String($(this).data('coords')), () => showToast('Координаты скопированы', 'success'));
});

/** Наивное время в поясе турнира → Date в UTC. Смещение пояса на момент
 *  события вычисляется через Intl (честно учитывает DST и историю зон);
 *  две итерации — на случай попадания на DST-границу. */
const zonedToUtcDate = (naive, timeZone) => {
  const asUtc = new Date(String(naive).replace(' ', 'T') + 'Z');
  const offsetMs = (date) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date);
    const get = (type) => Number(parts.find((part) => part.type === type).value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - date.getTime();
  };
  return new Date(asUtc.getTime() - offsetMs(new Date(asUtc.getTime() - offsetMs(asUtc))));
};

// смещение пояса на момент события в минутах (для VTIMEZONE)
const zoneOffsetMinutes = (naive, timeZone) =>
    Math.round((new Date(String(naive).replace(' ', 'T') + 'Z').getTime() - zonedToUtcDate(naive, timeZone).getTime()) / 60000);

// '+300' / '-420': смещение в формате TZOFFSETFROM/TO
const fmtOffset = (minutes) => {
  const abs = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`;
};

/** Скачивает .ics (RFC 5545) с событием турнира: клик по кнопке в шапке
 *  открывает/сохраняет файл, календарное приложение импортирует событие.
 *  Время события — «настенное» время таймзоны турнира (data-tz), явно
 *  помеченное DTSTART;TZID=... и блоком VTIMEZONE: в календаре показывается
 *  именно время турнира (у участника из другого пояса — эквивалент).
 *  DTSTAMP обязан быть в UTC. */
const addEventToCalendar = (button) => {
  const $button = $(button);
  // '2026-01-01 21:00:00' → '20260101T210000'
  const icsDate = (value) => String(value).replace(' ', 'T').replaceAll(/[-:]/g, '');
  const timeZone = $button.data('tz');
  // невалидная/отсутствующая зона — плавающее время, иначе Intl бросит RangeError
  let zone = null;
  try {
    new Intl.DateTimeFormat('en-US', {timeZone});
    zone = timeZone;
  } catch {
    // оставляем плавающее время
  }
  const escapeIcs = (text) => String(text).replaceAll(/([,;\\])/g, '\\$1').replaceAll('\n', '\\n');

  const start = $button.data('start');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//badmr//Tournament//RU',
  ];

  if (zone) {
    const offset = fmtOffset(zoneOffsetMinutes(start, zone));
    const zoneName = new Intl.DateTimeFormat('en-US', {timeZone: zone, timeZoneName: 'short'})
        .formatToParts(new Date()).find((part) => part.type === 'timeZoneName').value;
    lines.push(
        'BEGIN:VTIMEZONE',
        `TZID:${zone}`,
        'BEGIN:STANDARD',
        'DTSTART:19700101T000000',
        `TZOFFSETFROM:${offset}`,
        `TZOFFSETTO:${offset}`,
        `TZNAME:${zoneName}`,
        'END:STANDARD',
        'END:VTIMEZONE'
    );
  }

  lines.push(
      'BEGIN:VEVENT',
      `UID:${Date.now()}@badmr`,
      // '2026-10-21T12:15:30.123Z' → '20261021T121530Z'
      `DTSTAMP:${new Date().toISOString().replaceAll(/[-:]/g, '').slice(0, 15)}Z`,
      zone ? `DTSTART;TZID=${zone}:${icsDate(start)}` : `DTSTART:${icsDate(start)}`
  );
  const end = $button.data('end');
  if (end) {
    // у незавершённого турнира длительность не задана — DTEND опускается
    lines.push(zone ? `DTEND;TZID=${zone}:${icsDate(end)}` : `DTEND:${icsDate(end)}`);
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
// (promise-мидлвара), при статусе 0 соединения не было вовсе
$(document).ajaxError((event, xhr) => {
  if (xhr.status === 0) {
    showToast('Нет связи с сервером');
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

/** «N г. N мес. N д. назад» для дат в прошлом — та же логика заимствований
 *  календарных единиц, что была в EJS, но на клиенте: строка всегда свежая. */
const calendarPartsSince = (datetime) => {
  const end = new Date(datetime);
  if (isNaN(end.getTime())) {
    return [];
  }
  const now = new Date();

  let secs = now.getSeconds() - end.getSeconds();
  let mins = now.getMinutes() - end.getMinutes();
  let hours = now.getHours() - end.getHours();
  let days = now.getDate() - end.getDate();
  let months = now.getMonth() - end.getMonth();
  let years = now.getFullYear() - end.getFullYear();
  if (secs < 0) { mins--; secs += 60; }
  if (mins < 0) { hours--; mins += 60; }
  if (hours < 0) { days--; hours += 24; }
  if (days < 0) { months--; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
  if (months < 0) { years--; months += 12; }

  const parts = [];
  if (years > 0) { parts.push(`${years} г.`); }
  if (months > 0) { parts.push(`${months} мес.`); }
  if (days > 0) { parts.push(`${days} д.`); }
  return parts;
};
