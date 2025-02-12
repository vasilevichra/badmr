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
          $(`#select-form-table-1-${i}`)
          .bootstrapTable({
            data: field.players1, columns: selectColumns,
          });
          $(`#select-form-table-2-${i}`)
          .bootstrapTable({
            data: field.players2, columns: selectColumns
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
            $("#game").load(location.href + " #game");
            // $('#select-button').show(); // todo показывать только когда это был последний подтверждённый подбор
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

