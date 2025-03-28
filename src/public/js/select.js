const renderSelect = () => {
  $('#select-button').click(() => {

    $('#select-button').hide();

    $.getJSON("/api/common/ready/", ready => {
      if (ready.join("").length) {
        $.each(ready, i => {
          $(selectFormTemplate(i)).appendTo($('#select-block'));
        });

        $.each(ready, (i, field) => {
          let players1 = field.players1;
          let players2 = field.players2;

          $.each(players1, (i, player) => {
            const user = getJson(`/api/users/${player.user_id}`);
            players1[i]['pic'] = user.pic;
            players1[i]['sex'] = user.sex;
          });
          $.each(players2, (i, player) => {
            const user = getJson(`/api/users/${player.user_id}`);
            players2[i]['pic'] = user.pic;
            players2[i]['sex'] = user.sex;
          });

          $(`#select-form-table-1-${i}`)
          .bootstrapTable({
            data: field.players1,
            columns: selectColumns
          });
          $(`#select-form-table-2-${i}`)
          .bootstrapTable({
            data: field.players2,
            columns: selectColumns
          });
          $(`#select-form-info-${i}`).text(`Δ ${field.diff.toFixed(1)} баллов`);
          $(`#select-form-button-submit-${i}`).click((event) => {
            event.preventDefault();

            $.post('/api/matches/create', {
                  user_1_id: players1[0].user_id,
                  user_2_id: players1[1].user_id,
                  user_3_id: players2[0].user_id,
                  user_4_id: players2[1].user_id
                }
            );

            $(`#select-form-${i}`).hide();

            renderGames();

            showSelectButton();
          });
          $(`#select-form-button-reset-${i}`).click(() => {
            $(`#select-form-${i}`).hide();

            showSelectButton();
          });
        });
      } else {
        $('#select-info').show();
      }
    });
  });
}

const selectFormTemplate = (counter) => `
<form id="select-form-${counter}" class="select-form">
  <div class="row justify-content-center">
    <div class="col-auto col-lg-6 col-md-4 col-sm-4 desc">
      <table id="select-form-table-1-${counter}" class="select-form-table-1 table table-responsive mx-auto w-auto"></table>
    </div>
  </div>
  <div class="row justify-content-center">
    <div class="col-auto col-lg-6 col-md-4 col-sm-4 desc">
      <table id="select-form-table-2-${counter}" class="select-form-table-2 table table-responsive mx-auto w-auto"></table>
    </div>
  </div>
  <div class="row">
    <div class="text-center">
      <label id="select-form-info-${counter}" class="select-form-info"></label>
    </div>
  </div>
  <div class="select-form-buttons row">
    <div class="text-center">
      <button id="select-form-button-submit-${counter}" type="submit" class="select-form-button-submit btn btn-primary">Начать</button>
      <button id="select-form-button-reset-${counter}" type="reset" class="select-form-button-reset btn btn-danger">Отменить</button>
    </div>
  </div>
</form>`;

const selectColumns = [
  {
    field: 'name',
    title: 'Имя',
    formatter: (value, row) => playerNameFormatter(row.user_id, value, row.sex, row.pic),
    cellStyle: (value, row) => playerSexStyle(row.sex)
  },
  {
    field: 'rating',
    title: isPhone() ? 'Р.' : 'Рейтинг',
    align: 'center'
  },
  {
    field: 'matches',
    title: isPhone() ? 'И.' : 'Сыграно',
    align: 'center'
  }
];

const showSelectButton = () => {
  const info = $('#select-info');
  if (info.is(":visible") || $('.select-form-button-submit:visible').length === 0) {
    info.hide();
    $('.select-form').remove();
    $('#select-button').show();
  }
}
