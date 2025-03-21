# Бадминтон и ром

Программа для подбора игроков по рейтингу для равных и захватывающих матчей.
Суть игры с выбором по рейтингу напарника и соперников в том, чтобы сделать игры максильмально
интересными и напряжёнными, чтобы борьба велась за каждое очко. В таких условиях у **любителей** быстро
растёт уровень игры, появляется интерес к развитию, начинают задаваться вопросы.
А **тренер** освобождается от мучительного выбора расстановки игроков на корте по уровню
и по личному предпочтению игроков с кем они хотят или не хотят играть.

## Глоссарий
- `Δ` - Максимальная разница в сумме рейтингов пар при их формировании (дельта).
Настраиваемый предел: `tournament_settings.delta`.  

### Важные замечания:
1) Напарник назначается по рейтингу, а не по желанию;
2) Соперники подбираются, таким образом, чтобы сумма рейтингов пар не превышала `Δ`.

## Алгоритм
1) Поиск всех возможных вариантов пар, разница сумм рейтингов которых не превышает `Δ`.
2) Из предложенных вариантов выбираются те пары, которые меньше всего играли на текущем турнире.
