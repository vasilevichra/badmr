const renderSelect = () => {
  $('#select-button').off('click').click((event) => {
    event.preventDefault();

    $('#select-button').hide();

    $.getJSON(withTournament("/api/common/ready/"), ready => {
      if (ready.join("").length) {
        // карточка-барометр: две пары навстречу друг другу с полосами
        // по сумме рейтингов; шанс пары («Шанс») и превышение среднего
        // рейтинга сильнейшим игроком («Δ») — у каждой пары отдельно

        // корт каждой кандидатуры: /api/matches/create назначит матчу
        // первый свободный корт (available = 1, ORDER BY id ASC) — тот же
        // порядок здесь, чтобы бейдж корта совпал с фактическим назначением.
        // Свободный корт: available = 1 И на нём не идёт незавершённый
        // матч (флаг available может быть неактуален, поэтому занятые
        // номера кортов дополнительно вычисляем по /api/matches/unfinished
        // — он не фильтруется по турниру и отдаёт номер корта каждого
        // незавершённого матча)
        $.when(
            $.getJSON(withTournament("/api/courts/")),
            $.getJSON(withTournament("/api/matches/unfinished"))
        ).done((courts, unfinished) => {
          const busyNumbers = new Set(unfinished[0].map(match => match.court));
          const freeCourts = courts[0]
              .filter(court => court.available && !busyNumbers.has(court.number))
              .sort((a, b) => a.id - b.id)
              .map(court => court.number);
          $.each(ready, (i, field) => {
            field.court = freeCourts[i];
          });
          renderReadyForms(ready);
        });
      } else {
        $('#select-info').show();
      }
    });
  });
}

const renderReadyForms = (ready) => {
  $.each(ready, i => {
    $(selectFormTemplate(i)).appendTo($('#select-block'));
    $(selectBoardTemplate(i)).appendTo($('#select-block'));
  });

  $.each(ready, (i, field) => {
    const players1 = field.players1;
    const players2 = field.players2;

    // процент превышения среднего рейтинга пары одним из игроков
    const pairExcess = (players) => {
      const avg = (players[0].rating + players[1].rating) / 2;
      return (Math.max(players[0].rating, players[1].rating) / avg - 1) * 100;
    };

    const sigma1 = players1.reduce((acc, p) => acc + p.rating, 0);
    const sigma2 = players2.reduce((acc, p) => acc + p.rating, 0);
    // фаворит: при системе 50% — по моментуму (field.favorite),
    // без неё — сильнейшая пара по сумме рейтингов; при равенстве
    // сумм сильнейшей считается вторая (как в прежней раскраске)
    const favorite = field.favorite === 1 || field.favorite === 2
        ? field.favorite
        : (sigma1 > sigma2 ? 1 : 2);

    // формат чисел: на телефоне — целочисленный, без дробной части
    // не телефона — один знак после запятой (плавающая точка даёт хвосты
    // вида 770.9000000000001)
    const num = (value) => isPhone() ? `${Math.round(value)}` : value.toFixed(1);
    // проценты (шанс и разница) — всегда до одного знака после запятой
    const pct = (value) => `${value.toFixed(1)}%`;

    // аватар игрока — реплика playerAvatarFormatter (src/share.cjs):
    // pic — data-URL/http/«сырой» base64, битая картинка подменяется
    // заглушкой по полу; на углу аватарки — точка статуса: красная, если
    // игрок играл в последних матчах (флаг played вьюхи ready), зелёная,
    // если нет; точка ставится со стороны ФИО: справа у левой колонки,
    // слева у правой
    const avatar = (player, flip) => {
      const src = player.pic && (player.pic.startsWith('http') || player.pic.startsWith('data:'))
          ? player.pic
          : 'data:image/png;base64, ' + player.pic;
      const fallback = `this.onerror=null;this.src='/assets/images/${player.sex ? 'pepe' : 'pepe-girl'}.svg';`;
      const dot = `<i class="select-baro-dot ${flip ? 'select-baro-dot-l' : 'select-baro-dot-r'} ${player.played ? 'select-baro-dot-played' : 'select-baro-dot-idle'}"></i>`;
      return `<span class="select-baro-ava">` +
          `<img class="no-selection select-baro-pic" src="${player.pic ? src : `/assets/images/${player.sex ? 'pepe' : 'pepe-girl'}.svg`}" alt="" width="20" height="20" onerror="${fallback}"/>` +
          `${dot}</span>`;
    };

    // строка игрока «Имя рейтинг · сыграно матчей»; порядок задаётся
    // колонкой: слева — аватар + «Имя рейтинг · сыграно», справа —
    // «сыграно · рейтинг Имя» + аватар в конце; числа приглушённые
    // (secondary-info, как #id в playerNameFormatter); разделитель
    // между ФИО и рейтингом — пробел, между рейтингом и матчами — точка;
    // матчи — matches вьюхи ready (played там — флаг «играл
    // в последних N матчах»), их количество — всегда целое; клик по имени
    // открывает карточку игрока; на телефоне имя сокращается до
    // «Фамилия И.» и обрезается многоточием
    const matches = (player) => `${Math.round(player.matches)}`;
    const playerLine = (player, flip) =>
        `<span class="select-baro-name no-selection" data-user-id="${player.user_id}" role="button">` +
        (flip
            ? `<span class="secondary-info">${matches(player)}&nbsp;·&nbsp;${num(player.rating)}</span>&nbsp;${shortName(player.name)}&nbsp;${avatar(player, flip)}`
            : `${avatar(player, flip)}&nbsp;${shortName(player.name)}&nbsp;<span class="secondary-info">${num(player.rating)}&nbsp;·&nbsp;${matches(player)}</span>`) +
        `</span>`;

    const fillColumn = (side, players, sigma, chance, excess) => {
      const max = Math.max(sigma1, sigma2);
      // кубок: в левой колонке — справа от суммы, в правой — слева
      $(`#select-baro-sigma-${side}-${i}`).html(
          favorite !== Number(side) ? num(sigma) : side === 1
              ? num(sigma) + '<i class="bi bi-trophy-fill select-baro-trophy select-baro-trophy-after"></i>'
              : '<i class="bi bi-trophy-fill select-baro-trophy"></i>' + num(sigma)
      );
      // полоса — винрейт совместных матчей пары: вместе не играли — пустая
      $(`#select-baro-fill-${side}-${i}`).css('width', chance != null ? `${Math.min(chance, 100)}%` : '0%');
      $(`#select-baro-names-${side}-${i}`).html(players.map(p => playerLine(p, side === 2)).join(''));
      // шанс пары — только в полосе под суммой; мета — только Δ
      $(`#select-baro-meta-${side}-${i}`).html(
          `<span class="select-baro-chip select-baro-chip-warn">Δ&nbsp;${pct(excess)}</span>`
      );
      $(`#select-baro-col-${side}-${i}`).toggleClass('select-baro-fav', favorite === Number(side));
    };
    fillColumn(1, players1, sigma1, field.chance1, pairExcess(players1));
    fillColumn(2, players2, sigma2, field.chance2, pairExcess(players2));

    // строки «имя · числа» — по содержимому: самая длинная из 4 игроков
    // пары задаёт ширину остальным строкам; эта же ширина — колонкам и
    // полосам шанса (колонка ровно по ширине шанса, симметрично)
    const nameLines = $(`#select-form-${i} .select-baro-name`).toArray();
    const barWidth = Math.max(...nameLines.map(el => el.offsetWidth));
    nameLines.forEach(el => {
      el.style.width = `${barWidth}px`;
    });
    $(`#select-baro-col-1-${i}, #select-baro-col-2-${i}`)
        .css('width', `${barWidth}px`);

    // телефон: плашка растянута на ширину экрана (CSS); если строки с
    // ФИ и аватарками не умещаются — пропорционально ужимаем шрифт и
    // аватарки (CSS var --baro-fit), каждый раз пересчитывая ширины
    // строк по новому шрифту; пол в 0.55 — ниже текст нечитаем.
    // Переполнение меряем scrollWidth: ширина плашки теперь задана CSS
    if (isPhone()) {
      const baro = $(`#select-form-${i} .select-baro`).get(0);
      if (baro) {
        let fit = 1;
        baro.style.setProperty('--baro-fit', fit);
        for (let guard = 0; guard < 6 && baro.scrollWidth > baro.clientWidth && fit > 0.55; guard++) {
          fit = Math.max(0.55, fit * baro.clientWidth / baro.scrollWidth);
          baro.style.setProperty('--baro-fit', fit);
          const lines = $(`#select-form-${i} .select-baro-name`).toArray();
          lines.forEach(el => { el.style.width = ''; });
          const w = Math.max(...lines.map(el => el.offsetWidth));
          lines.forEach(el => { el.style.width = `${w}px`; });
          $(`#select-baro-col-1-${i}, #select-baro-col-2-${i}`).css('width', `${w}px`);
        }
      }
    }

    // бейдж корта между половинками
    $(`#select-baro-court-${i}`).text(field.court ? `Корт №${field.court}` : 'Корт —');

    // превью-табло кандидатуры: составы пар и корт, счёт 0:0
    $(`#select-board-title-${i}`).text(`Корт №${field.court ?? '—'} · кандидатура ${i + 1}`);
    $(`#select-board-team-1-${i}`).html(players1.map(p => playerLine(p, false)).join('<br>'));
    $(`#select-board-team-2-${i}`).html(players2.map(p => playerLine(p, true)).join('<br>'));

    // клик по имени — карточка игрока (в карточке и на превью-табло)
    $(`#select-form-${i}, #select-board-${i}`).off('click', '.select-baro-name')
        .on('click', '.select-baro-name', (event) => {
          openPlayerWindow($(event.currentTarget).data('user-id'));
        });

    $(`#select-form-button-submit-${i}`).off('click').click((event) => {
      event.preventDefault();

      // прогресс-бар турнира появляется при первом «Начать»
      renderTournamentProgress(true);

      // защита от двойной отправки: кнопка неактивна до ответа сервера
      const submitButton = $(`#select-form-button-submit-${i}`).prop('disabled', true);

      $.ajax({
        url: '/api/matches/create',
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json; charset=utf-8',
        data: JSON.stringify({
          user_1_id: players1[0].user_id,
          user_2_id: players1[1].user_id,
          user_3_id: players2[0].user_id,
          user_4_id: players2[1].user_id
        }),
        success: function (result) {
          $(`#select-form-${i}`).hide();
          $(`#select-board-${i}`).modal('hide');
          renderGames();
          showSelectButton();
          // матч создан: игроки перешли в «играет» — таблица игроков
          // и корты обновляются по факту ответа, а не сразу после
          // отправки запроса (иначе гонка: данные ещё старые)
          refresh.table.player();
          refresh.table.court();
        },
        complete: function () {
          // при ошибке форма остаётся, кнопка снова активна
          // (текст ошибки показывает глобальный обработчик ajaxError)
          submitButton.prop('disabled', false);
        }
      });
    });
    $(`#select-form-button-reset-${i}`).off('click').click((event) => {
      event.preventDefault();

      $(`#select-form-${i}`).hide();

      showSelectButton();
    });
  });
}

// разметка формы подбора берётся из <template id="select-form-template"> (select-form.ejs),
// __i__ заменяется на номер формы
const selectFormTemplate = (counter) => $('#select-form-template').html().replaceAll('__i__', counter);

// разметка превью-табло кандидатуры — из <template id="select-board-template">
const selectBoardTemplate = (counter) => $('#select-board-template').html().replaceAll('__i__', counter);

// имя игрока для барометра: на телефоне — «Фамилия И.» (как в
// playerNameFormatter), на десктопе — полное
const shortName = (name) => {
  if (!isPhone()) {
    return name;
  }
  const names = name.split(/\s/);
  return `${names[0]} ${names[1]?.charAt(0) ?? ''}.`;
}

const showSelectButton = (force) => {
  const info = $('#select-info');
  // force — безусловный сброс: изменение настроек, влияющих на подбор,
  // обесценивает уже показанные пары даже если все формы ещё видимы
  if (force || info.is(":visible") || $('.select-form-button-submit:visible').length === 0) {
    info.hide();
    $('.select-form').remove();
    $('.select-board-preview').remove();
    $('#select-button').show();
  }
}
