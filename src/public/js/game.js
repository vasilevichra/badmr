const renderGames = () => {
  $.getJSON("/api/matches/unfinished", matches => {
    if (matches.length > 0) {
      $('.game-info').hide();

      const gameBlock = $('#game-block');
      gameBlock.empty();
      const formTemplate = isPhone() ? gameFormPhoneTemplate : gameFormTemplate;
      $.each(matches, (i, match) => {
        $(formTemplate(i)).appendTo(gameBlock);

        fillMatch(i, match);
      });
    }
  });
  // сохранение значений счёта игр в печеньки и блокировка/разблокировка input-полей
  $(document.body).on('change keydown keypress keyup mousedown click mouseup', '.game-input', function () {
    const value = $(this).val();
    const id = $(this).attr('id');
    const cookieId = $(this).attr('ids');
    const counter = Number(id.slice(-1));

    const handleGameScoreNum = (i) => {
      if (id === `game-input-${i}1-${counter}`) {
        $(`#game-input-${i}2-${counter}`).val(winValue(value)).prop('disabled', true).addClass('no-selection fw-bolder');
      }
      if (id === `game-input-${i}2-${counter}`) {
        $(`#game-input-${i}1-${counter}`).val(winValue(value)).prop('disabled', true).addClass('no-selection fw-bolder');
      }
    }

    const unlockGameScoreNum = (i) => {
      if ([`game-input-${i - 1}1-${counter}`, `game-input-${i - 1}2-${counter}`].includes(id)) {
        $([`${i}1-${counter}`, `${i}2-${counter}`].map(i => `#game-input-${i}`).join(', ')).each((i, el) => {
          $(el).prop('disabled', false).attr("placeholder", i + 1);
        });
      }
    }

    const cleanGameScoreNum = (i) => {
      if (id === `game-input-${i}1-${counter}`) {
        $(`#${id}`).attr("placeholder", 1);
        $(`#game-input-${i}2-${counter}`).val('').prop('disabled', false).removeClass('no-selection fw-bolder').attr("placeholder", 2);
      }
      if (id === `game-input-${i}2-${counter}`) {
        $(`#${id}`).attr("placeholder", 2);
        $(`#game-input-${i}1-${counter}`).val('').prop('disabled', false).removeClass('no-selection fw-bolder').attr("placeholder", 1);
      }
    }

    const gameSubmitButton = $(`#game-form-button-submit-${counter}`);

    const unlockSubmitButton = () =>
        gameSubmitButton
        .removeClass('btn-outline-success')
        .addClass('btn-success')
        .prop('disabled', false);

    const lockSubmitButton = () =>
        gameSubmitButton
        .removeClass('btn-success')
        .addClass('btn-outline-success')
        .prop('disabled', true);

    if (value) {
      handleGameScoreNum(1);
      unlockGameScoreNum(2);

      handleGameScoreNum(2);

      const field11 = $(`#game-input-11-${counter}:not(:disabled)`).val();
      const field12 = $(`#game-input-12-${counter}:not(:disabled)`).val();
      const field21 = $(`#game-input-21-${counter}:not(:disabled)`).val();
      const field22 = $(`#game-input-22-${counter}:not(:disabled)`).val();

      const need3 = !((field11 && field21) || (field12 && field22));

      if (need3) {
        unlockGameScoreNum(3);
        handleGameScoreNum(3);
      } else {
        unlockSubmitButton();
      }

      const field31 = $(`#game-input-31-${counter}:not(:disabled)`).val();
      const field32 = $(`#game-input-32-${counter}:not(:disabled)`).val();

      if (need3 && (field31 || field32)) {
        unlockSubmitButton();
      }

      $.cookie(cookieId, value);
    } else {
      cleanGameScoreNum(getGameRowNum(id));
      lockSubmitButton();

      $.removeCookie(cookieId);
      $.removeCookie(cookieId2cookieDateId(cookieId));
    }
  });

  // сохранение значений времени игр в печеньки
  $(document.body).on('change', '.game-input', function () {
    const value = $(this).val();
    const cookieDateId = cookieId2cookieDateId($(this).attr('ids'));
    if (value && !$.cookie(cookieDateId)) {
      $.cookie(cookieDateId, date2DatabaseFormat());
    }
  });
}

const fillMatch = (counter, match) => {
  $(`#game-table-1-${counter}`)
  .bootstrapTable({
    showHeader: false,
    columns: [{
      field: 'name',
      title: 'Name',
      formatter: (value, row) => this.share.playerNameFormatter(row.id, value, row.sex, row.pic, isPhone()),
      cellStyle: (value, row) => playerSexStyle(row.sex)
    }],
    data: [{
      id: match.user_1_id,
      name: match.name1,
      sex: match.sex1,
      pic: match.pic1
    }, {
      id: match.user_2_id,
      name: match.name2,
      sex: match.sex2,
      pic: match.pic2
    }]
  });

  $(`#game-table-2-${counter}`)
  .bootstrapTable({
    showHeader: false,
    columns: [{
      field: 'name',
      title: 'Name',
      formatter: (value, row) => this.share.playerNameFormatter(row.id, value, row.sex, row.pic, isPhone()),
      cellStyle: (value, row) => playerSexStyle(row.sex)
    }],
    data: [{
      id: match.user_3_id,
      name: match.name3,
      sex: match.sex3,
      pic: match.pic3
    }, {
      id: match.user_4_id,
      name: match.name4,
      sex: match.sex4,
      pic: match.pic4
    }]
  });

  $(`#game-form-info-${counter}`).text(`Матч №${match.id}, корт №${match.court}`);

  // выставление значения счёта игр из печенек при перезагрузке страницы
  for (let i = 1; i <= 3; i++) {
    for (let j = 1; j <= 2; j++) {
      const id = userIds2cookieId([match.user_1_id, match.user_2_id, match.user_3_id, match.user_4_id], i, j);
      $(`#game-input-${i}${j}-${counter}`).attr('ids', id);
      if ($.cookie(id)) {
        $(`input[ids='${id}']`).val($.cookie(id)).trigger('click');
      }
    }
  }

  $(`#game-form-button-submit-${counter}`).click((event) => {
    event.preventDefault();

    const gamePoint11 = $(`#game-input-11-${counter}:not(:disabled)`).val() || '';
    const gamePoint12 = $(`#game-input-12-${counter}:not(:disabled)`).val() || '';
    const gamePoint21 = $(`#game-input-21-${counter}:not(:disabled)`).val() || '';
    const gamePoint22 = $(`#game-input-22-${counter}:not(:disabled)`).val() || '';
    const gamePoint31 = $(`#game-input-31-${counter}:not(:disabled)`).val() || '';
    const gamePoint32 = $(`#game-input-32-${counter}:not(:disabled)`).val() || '';

    if (gamePoint11 === '' && gamePoint12 === '') {
      alert('Введите результат первой игры');
      return false;
    }

    if (gamePoint21 === '' && gamePoint22 === '') {
      alert('Введите результат второй игры');
      return false;
    }

    const is11 = gamePoint12 === '' || (gamePoint11 !== '' && gamePoint11 < gamePoint12);
    const is21 = gamePoint22 === '' || (gamePoint21 !== '' && gamePoint21 < gamePoint22);
    const is31 = gamePoint32 === '' || (gamePoint31 !== '' && gamePoint31 < gamePoint32);
    const need3 = !((is11 && is21) || (!is11 && !is21));

    if (need3 && gamePoint31 === '' && gamePoint32 === '') {
      alert('Введите результат третьей игры');
      return false;
    }

    if (is11) {
      const cookieId11 = $(`#game-input-11-${counter}`).attr('ids');
      const cookieDateId11 = cookieId2cookieDateId(cookieId11);
      $.ajax({
        url: '/api/games/create',
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json; charset=utf-8',
        data: JSON.stringify({
          match_id: match.id,
          lost_1_by: gamePoint11,
          lost_2_by: null,
          created_at: $.cookie(cookieDateId11)
        }),
        success: function (result) {
          $.removeCookie(cookieId11);
          $.removeCookie(cookieDateId11);
        },
        error: function (err) {
          alert(JSON.stringify(err, null, 2));
        }
      });
    } else {
      const cookieId12 = $(`#game-input-12-${counter}`).attr('ids');
      const cookieDateId12 = cookieId2cookieDateId(cookieId12);
      $.ajax({
        url: '/api/games/create',
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json; charset=utf-8',
        data: JSON.stringify({
          match_id: match.id,
          lost_1_by: null,
          lost_2_by: gamePoint12,
          created_at: $.cookie(cookieDateId12)
        }),
        success: function (result) {
          $.removeCookie(cookieId12);
          $.removeCookie(cookieDateId12);
        },
        error: function (err) {
          alert(JSON.stringify(err, null, 2));
        }
      });
    }

    if (is21) {
      const cookieId21 = $(`#game-input-21-${counter}`).attr('ids');
      const cookieDateId21 = cookieId2cookieDateId(cookieId21);
      $.ajax({
        url: '/api/games/create',
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json; charset=utf-8',
        data: JSON.stringify({
          match_id: match.id,
          lost_1_by: gamePoint21,
          lost_2_by: null,
          created_at: $.cookie(cookieDateId21)
        }),
        success: function (result) {
          $.removeCookie(cookieId21);
          $.removeCookie(cookieDateId21);
        },
        error: function (err) {
          alert(JSON.stringify(err, null, 2));
        }
      });
    } else {
      const cookieId22 = $(`#game-input-22-${counter}`).attr('ids');
      const cookieDateId22 = cookieId2cookieDateId(cookieId22);
      $.ajax({
        url: '/api/games/create',
        type: 'POST',
        dataType: 'json',
        contentType: 'application/json; charset=utf-8',
        data: JSON.stringify({
          match_id: match.id,
          lost_1_by: null,
          lost_2_by: gamePoint22,
          created_at: $.cookie(cookieDateId22)
        }),
        success: function (result) {
          $.removeCookie(cookieId22);
          $.removeCookie(cookieDateId22);
        },
        error: function (err) {
          alert(JSON.stringify(err, null, 2));
        }
      });
    }
    if (need3) {
      if (is31) {
        const cookieId31 = $(`#game-input-31-${counter}`).attr('ids');
        const cookieDateId31 = cookieId2cookieDateId(cookieId31);
        $.ajax({
          url: '/api/games/create',
          type: 'POST',
          dataType: 'json',
          contentType: 'application/json; charset=utf-8',
          data: JSON.stringify({
            match_id: match.id,
            lost_1_by: gamePoint31,
            lost_2_by: null,
            created_at: $.cookie(cookieDateId31)
          }),
          success: function (result) {
            $.removeCookie(cookieId31);
            $.removeCookie(cookieDateId31);
          },
          error: function (err) {
            alert(JSON.stringify(err, null, 2));
          }
        });
      } else {
        const cookieId32 = $(`#game-input-32-${counter}`).attr('ids');
        const cookieDateId32 = cookieId2cookieDateId(cookieId32);
        $.ajax({
          url: '/api/games/create',
          type: 'POST',
          dataType: 'json',
          contentType: 'application/json; charset=utf-8',
          data: JSON.stringify({
            match_id: match.id,
            lost_1_by: null,
            lost_2_by: gamePoint32,
            created_at: $.cookie(cookieDateId32)
          }),
          success: function (result) {
            $.removeCookie(cookieId32);
            $.removeCookie(cookieDateId32);
          },
          error: function (err) {
            alert(JSON.stringify(err, null, 2));
          }
        });
      }
    }

    $(`#game-form-${counter}`).hide();
    refresh.table.player();
    refresh.table.court();

    if ($('.game-form-button-submit:visible').length === 0) {
      $('.game-form').remove();
      $('.game-info').show();
    }

    refresh.block.by.id('match-history-block'); // обновление блока истории матчей
  });

  $(`#game-form-button-reset-${counter}`).click(event => {
    event.preventDefault();

    if (confirm(`Удалить матч №${match.id}?`)) {
      for (let i = 1; i <= 3; i++) {
        for (let j = 1; j <= 2; j++) {
          const cookieId = $(`#game-input-${i}${j}-${counter}`).attr('ids');
          $.removeCookie(cookieId);
          $.removeCookie(cookieId2cookieDateId(cookieId));
        }
      }
      $.post(`/api/matches/delete/${match.id}`);
      $(`#game-form-${counter}`).remove();
      if ($('#game-block > div').length === 0) {
        refresh.block.by.id('game'); // обновление блока игры
      }

      refresh.table.court();
    }
  });
}

const gameFormTemplate = (counter) => `
<div id="game-form-${counter}" class="game-form row justify-content-center align-items-center">
  <div class="col-auto">
    <table id="game-table-1-${counter}" class="game-table-1 table table-responsive mx-auto w-auto"></table>
  </div>
  <div class="col-auto">
    <div>
      <input id="game-input-11-${counter}" class="game-input game-input-left game-input-11" type="text" required minlength="1" maxlength="2" size="2" placeholder="1"/>
      <label>:</label>
      <input id="game-input-12-${counter}" class="game-input game-input-right game-input-12" type="text" required minlength="1" maxlength="2" size="2" placeholder="2"/>
    </div>
    <div>
      <input id="game-input-21-${counter}" class="game-input game-input-left game-input-21" type="text" required disabled minlength="1" maxlength="2" size="2" />
      <label>:</label>
      <input id="game-input-22-${counter}" class="game-input game-input-right game-input-22" type="text" required disabled minlength="1" maxlength="2" size="2"/>
    </div>
    <div>
      <input id="game-input-31-${counter}" class="game-input game-input-left game-input-31" type="text" required disabled minlength="1" maxlength="2" size="2"/>
      <label>:</label>
      <input id="game-input-32-${counter}" class="game-input game-input-right game-input-32" type="text" required disabled minlength="1" maxlength="2" size="2"/>
    </div>
  </div>
  <div class="col-auto">
    <table id="game-table-2-${counter}" class="game-table-2 table table-responsive mx-auto w-auto"></table>
  </div>
  <div class="row">
    <div class="text-center">
      <label id="game-form-info-${counter}" class="game-form-info">Корт</label>
    </div>
  </div>
  <div class="game-form-buttons row">
    <div class="text-center">
      <button id="game-form-button-submit-${counter}" type="submit" class="game-form-button-submit btn btn-outline-success" disabled>Завершить</button>
      <button id="game-form-button-reset-${counter}" type="reset" class="game-form-button-reset btn btn-outline-danger">Отменить</button>         
    </div>
  </div>
</div>`;

const gameFormPhoneTemplate = (counter) => `
<div id="game-form-${counter}" class="game-form row justify-content-center align-items-center">
  <div class="col col-auto justify-content-center">
    <div class="row">
      <table id="game-table-1-${counter}" class="game-table-1-p table table-responsive mx-auto w-auto"></table>
    </div>
    <div class="row input-group justify-content-center game-form-horizontal-inputs">
      <div class="col col-2">
        <input id="game-input-11-${counter}" class="game-input-left-p game-input-11-p" type="text" required minlength="1" maxlength="2" size="2" placeholder="1¹"/>
        <input id="game-input-12-${counter}" class="game-input-right-p game-input-12-p" type="text" required minlength="1" maxlength="2" size="2" placeholder="2¹"/>
      </div>
      <div class="col col-2">
        <input id="game-input-21-${counter}" class="game-input-left-p game-input-21" type="text" required disabled minlength="1" maxlength="2" size="2" placeholder="1²"/>
        <input id="game-input-22-${counter}" class="game-input-right-p game-input-22" type="text" required disabled minlength="1" maxlength="2" size="2" placeholder="2²"/>
      </div>
      <div class="col col-2">
        <input id="game-input-31-${counter}" class="game-input-left-p game-input-31-p" type="text" required disabled minlength="1" maxlength="2" size="2" placeholder="1³"/>
        <input id="game-input-32-${counter}" class="game-input-right-p game-input-32-p" type="text" required disabled minlength="1" maxlength="2" size="2" placeholder="1³"/>
      </div>
    </div>
    <div class="row">
      <table id="game-table-2-${counter}" class="game-table-2-p table table-responsive mx-auto w-auto"></table>
    </div>
  </div>
  <div class="row">
    <div class="text-center">
      <label id="game-form-info-${counter}" class="game-form-info">Корт</label>
    </div>
  </div>
  <div class="row">
    <div class="text-center">
      <button id="game-form-button-submit-${counter}" type="submit" class="game-form-button-submit btn btn-outline-primary" disabled>Завершить</button>
    </div>
  </div>
</div>`;

const cookieId2cookieDateId = (cookieId) => cookieId.slice(0, -2).concat('-date');
const getGameRowNum = (id) => Number(id.charAt(11));
const userIds2cookieId = (ids, gameCounter, pairCounter) => `${ids.sort((a, b) => a - b).join('-')}_${gameCounter}-${pairCounter}`;
