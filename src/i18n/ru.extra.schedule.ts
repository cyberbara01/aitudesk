// Строки плитки «Расписание» и её страницы настроек, которых нет в ru.ts.
const plural = (n: number, one: string, few: string, many: string): string => {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
};

export const extra = {
  pageDesc:
    "Пары по дням недели. Плитка показывает выбранный день, подсвечивает текущую пару и подсказывает, когда начнётся следующая.",
  perWeek: (n: number) => (n === 0 ? "Пар пока нет" : `${n} ${plural(n, "пара", "пары", "пар")} в неделю`),
  dayEmpty: "В этот день пар нет",
  dayEmptyHint: "Добавьте первую пару — она сразу появится на плитке",
  weekendHidden: "На плитке выходные скрыты. Включите «Показывать выходные» в разделе «Отображение»",
  showWeekendHint: "Сб и Вс появятся в ряду дней на плитке",
  followTodayHint: "В полночь и при запуске плитка возвращается на сегодняшний день",
  backgroundHint: "Без фона список лежит прямо на обоях",
  colorAccent: "Как акцент",
  colorOwn: "Свой цвет",
  colorHint: "Полоса слева от пары и подпись «Сейчас»",
  overlaps: (title: string, range: string) => `Пересекается с «${title}» (${range})`,
  resetTitle: "Сброс",
  clearHint: "Удалит все пары во всех днях. Отменить нельзя",
  clearShort: "Очистить",
  previewHint: "Так пара будет выглядеть на плитке",
} as const;
