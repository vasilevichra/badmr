const renderMatches = () => {
  $.getJSON("/api/matches/unfinished", result => {
    if (result.length > 0) {
      // result.forEach((row) => {})
      $('.game-info').hide();
      $('.game-form').show();
      const match = result[0];
      renderMatch(match);
    }
  });
}

const renderMatch = (match) => {
  $('.game-table-1')
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

  $('.game-table-2')
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

  $('.game-form-info').text(`Корт №${match.court}`);

  $('.game-form-button-submit').click((event) => {
    event.preventDefault();

    const gamePoint11 = $('.game-input-11').val();
    const gamePoint12 = $('.game-input-12').val();
    const gamePoint21 = $('.game-input-21').val();
    const gamePoint22 = $('.game-input-22').val();
    const gamePoint31 = $('.game-input-31').val();
    const gamePoint32 = $('.game-input-32').val();

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
    $('.game-info').show();
    $('.game-form').hide();
    $('#player-table').bootstrapTable('refresh');
    // todo остановился тут
  });
}