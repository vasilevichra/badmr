const renderSelect = () => {
  $(selectFormTemplate).appendTo($('#select-block'));

  $('#select-button').click(() => {
    $.getJSON("/api/common/ready/", ready => {
      $('#select-button').hide();
      if (ready.join("").length) {
        $('.select-form').show();
        $.getJSON("/api/matches/unfinished/has", unfinished_matches => {
          if (unfinished_matches.has) {
            $('.select-form-button-submit').prop("disabled", true);
          }
        });

        $.each([ready[0]], (i, field) => { // todo заменить на ready, в случае множественного выбора
          let players1 = field.players1;
          let players2 = field.players2;
          $('.select-form-table-1')
          .bootstrapTable({
            data: field.players1, columns: selectColumns,
          });
          $('.select-form-table-2')
          .bootstrapTable({
            data: field.players2, columns: selectColumns
          });
          $('.select-form-info').text(`Δ ${field.diff.toFixed(1)} баллов`);
          $('.select-form-button-submit').click(() => {
            $.post('/api/matches/create', {
                  user_1_id: players1[0].user_id,
                  user_2_id: players1[1].user_id,
                  user_3_id: players2[0].user_id,
                  user_4_id: players2[1].user_id
                }
            );

            // todo устранить прыжок на начало страницы
            scrollToId('game'); // а это не работает
          });
        });
      } else {
        $('#select-info').show();
      }
    });
  });
}

const selectFormTemplate = `
      <form class="select-form" style="display:none">
        <div class="row justify-content-center">
          <div class="col-auto col-lg-6 col-md-4 col-sm-4 desc">
            <table class="select-form-table-1 table table-responsive mx-auto w-auto"></table>
          </div>
        </div>
        <div class="row justify-content-center">
          <div class="col-auto col-lg-6 col-md-4 col-sm-4 desc">
            <table class="select-form-table-2 table table-responsive mx-auto w-auto"></table>
          </div>
        </div>
        <div class="row">
          <div class="text-center">
            <label class="select-form-info"></label>
          </div>
        </div>
        <div class="row">
          <div class="text-center">
            <button type="submit" class="select-form-button-submit btn btn-primary">Начать</button>
            <button type="reset" class="select-form-button-reset btn btn-danger">Отменить</button>
          </div>
        </div>
      </form>`;

const selectColumns = [
  {
    field: 'user_id',
    title: 'ID',
    align: 'center'
  },
  {
    field: 'name',
    title: 'Имя'
  },
  {
    field: 'sex',
    title: 'Пол',
    align: 'center'
  },
  {
    field: 'rating',
    title: 'Рейтинг',
    align: 'center'
  },
  {
    field: 'matches',
    title: 'Сыграно',
    align: 'center'
  }
];

