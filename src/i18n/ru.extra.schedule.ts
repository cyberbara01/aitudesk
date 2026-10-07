// Строки плитки «Расписание» и её страницы настроек, которых нет в ru.ts. Без длинных тире.
import { plural } from "./ru";
/** Non-breaking space: keeps «в» with its word and «в 08:00» on one line. */
const NBSP = String.fromCharCode(0xa0);

/** «пара», «пары», «пар» for a count (the number is drawn separately in the week overview). */
const lessonsWord = (n: number) => plural(n, "пара", "пары", "пар");

/** «1 пара», «2 пары», «5 пар», «21 пара». */
const lessonsCount = (n: number) => `${n} ${lessonsWord(n)}`;

export const extra = {
  // ---- Плитка ----
  emptyTitle: "Расписание пустое",
  emptyHint: "Добавьте пары в настройках",
  /** «через 25 мин», «через 1 ч», «через 1 ч 5 мин» (ru.schedule.startsIn yields «через 1 ч 0 мин»). */
  startsIn: (m: number) => (m < 60 ? `через ${m} мин` : m % 60 === 0 ? `через ${m / 60} ч` : `через ${Math.floor(m / 60)} ч ${m % 60} мин`),
  tomorrow: "завтра",
  /** «Ближайшая пара завтра в 08:00», «Ближайшая пара в среду в 08:00»; prepositions stay with their word. */
  nextLesson: (when: string, time: string) => `Ближайшая пара ${when.replace(/ /g, NBSP)} в${NBSP}${time}`,

  // ---- Страница настроек ----
  pageDesc:
    "Пары по дням недели. Плитка показывает выбранный день, подсвечивает текущую пару и подсказывает, когда начнётся следующая.",
  perWeek: (n: number) => (n === 0 ? "Пар пока нет" : `${lessonsCount(n)} в неделю`),
  lessonsCount,
  lessonsWord,
  dayEmpty: "В этот день пар нет",
  noLessonsShort: "нет пар",
  dayEmptyHint: "Добавьте первую пару, и она сразу появится на плитке",
  dayHiddenHint: "Сейчас этот день на плитке скрыт. Он появится там, как только вы добавите пару",
  showEmptyDays: "Показывать дни без пар",
  showEmptyDaysHint: "Если выключить, на плитке останутся только дни с парами, а в свободный день откроется ближайший день с парами",
  showWeekendHint: "Сб и Вс будут в ряду дней всегда. Если выключить, выходной виден, только когда в нём есть пары",
  showWeekendOffHint: "Не действует, пока дни без пар скрыты",
  followTodayHint: "В полночь плитка возвращается на сегодняшний день, даже если вы открыли другой",
  backgroundHint: "Без фона список лежит прямо на обоях",
  clearHint: "Удалит все пары во всех днях. Отменить нельзя",
  clearShort: "Очистить",
  clearTitle: "Очистить расписание?",
  clearText: "Будут удалены все пары во всех днях недели. Отменить это нельзя.",
  inSchedule: (n: number) => `Сейчас в расписании ${lessonsCount(n)}`,

  // ---- Редактор пары ----
  colorAccent: "Как акцент",
  colorOwn: "Свой цвет",
  colorHint: "Полоса слева от пары и подпись «Сейчас»",
  overlaps: (title: string, range: string) => `Пересекается с «${title}» (${range})`,
  endAfterStart: "Конец должен быть позже начала",
  previewHint: "Так пара будет выглядеть на плитке",
} as const;
