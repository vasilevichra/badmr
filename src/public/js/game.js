const renderMatches = () => {
  $.getJSON("/api/matches/unfinished", matches => {
    if (matches.length > 0) {
      $('.game-info').hide();

      const gameBlock = $('#game-block');
      gameBlock.empty();
      $.each(matches, (i, match) => {
        $(gameFormTemplate(i)).appendTo(gameBlock);

        fillMatch(i, match);
      });
    }
  });
}

const fillMatch = (counter, match) => {
  $(`#game-table-1-${counter}`)
  .bootstrapTable({
    showHeader: false,
    columns: [{
      field: 'name',
      title: 'Name'
    }],
    data: [{
      name: match.name1
    }, {
      name: match.name2
    }]
  });

  $(`#game-table-2-${counter}`)
  .bootstrapTable({
    showHeader: false,
    columns: [{
      field: 'name',
      title: 'Name'
    }],
    data: [{
      name: match.name3
    }, {
      name: match.name4
    }]
  });

  $(`#game-form-info-${counter}`).text(`Корт №${match.court}`);

  $(`#game-form-button-submit-${counter}`).click((event) => {
    event.preventDefault();

    const gamePoint11 = $(`#game-input-11-${counter}`).val();
    const gamePoint12 = $(`#game-input-12-${counter}`).val();
    const gamePoint21 = $(`#game-input-21-${counter}`).val();
    const gamePoint22 = $(`#game-input-22-${counter}`).val();
    const gamePoint31 = $(`#game-input-31-${counter}`).val();
    const gamePoint32 = $(`#game-input-32-${counter}`).val();

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
      $.post('/api/games/create', {
            match_id: match.id,
            lost_1_by: gamePoint11,
            lost_2_by: null
          }
      );
    } else {
      $.post('/api/games/create', {
            match_id: match.id,
            lost_1_by: null,
            lost_2_by: gamePoint12
          }
      );
    }

    if (is21) {
      $.post('/api/games/create', {
            match_id: match.id,
            lost_1_by: gamePoint21,
            lost_2_by: null
          }
      );
    } else {
      $.post('/api/games/create', {
            match_id: match.id,
            lost_1_by: null,
            lost_2_by: gamePoint22
          }
      );
    }
    if (need3) {
      if (is31) {
        $.post('/api/games/create', {
              match_id: match.id,
              lost_1_by: gamePoint31,
              lost_2_by: null
            }
        );
      } else {
        $.post('/api/games/create', {
              match_id: match.id,
              lost_1_by: null,
              lost_2_by: gamePoint32
            }
        );
      }
    }
    $(`#game-form-${counter}`).hide();
    $('#player-table').bootstrapTable('refresh');
    $('#cort-table').bootstrapTable('refresh');

    if ($('.game-form-button-submit:visible').length === 0) {
      $('.game-form').remove();
      $('.game-info').show();
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
      <input id="game-input-11-${counter}" class="game-input-left game-input-11" type="text" required minlength="1" maxlength="2" size="2"/>
      <label>:</label>
      <input id="game-input-12-${counter}" class="game-input-right game-input-12" type="text" required minlength="1" maxlength="2" size="2"/>
    </div>
    <div>
      <input id="game-input-21-${counter}" class="game-input-left game-input-21" type="text" required minlength="1" maxlength="2" size="2"/>
      <label>:</label>
      <input id="game-input-22-${counter}" class="game-input-right game-input-22" type="text" required minlength="1" maxlength="2" size="2"/>
    </div>
    <div>
      <input id="game-input-31-${counter}" class="game-input-left game-input-31" type="text" required minlength="1" maxlength="2" size="2"/>
      <label>:</label>
      <input id="game-input-32-${counter}" class="game-input-right game-input-32" type="text" required minlength="1" maxlength="2" size="2"/>
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
  <div class="row">
    <div class="text-center">
      <button id="game-form-button-submit-${counter}" type="submit" class="game-form-button-submit btn btn-primary">Завершить</button>
    </div>
  </div>
</div>`;