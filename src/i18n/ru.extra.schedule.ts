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
  /** «1 пара», «2 пары», «5 пар», «21 пара» — a correct Russian plural (ru.schedule.lessons gets 21–24 wrong). */
  lessonsCount: (n: number) => `${n} ${plural(n, "пара", "пары", "пар")}`,
  /** «через 25 мин», «через 1 ч», «через 1 ч 5 мин» (ru.schedule.startsIn yields «через 1 ч 0 мин»). */
  startsIn: (m: number) => (m < 60 ? `через ${m} мин` : m % 60 === 0 ? `через ${m / 60} ч` : `через ${Math.floor(m / 60)} ч ${m % 60} мин`),
  dayEmpty: "В этот день пар нет",
  noLessonsShort: "нет пар",
  dayEmptyHint: "Добавьте первую пару, и она сразу появится на плитке",
  weekendHidden: "Пустые выходные на плитке скрыты. Чтобы видеть Сб и Вс всегда, включите «Показывать выходные» в разделе «Отображение»",
  showWeekendHint: "Сб и Вс будут в ряду дней на плитке всегда, даже без пар",
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
