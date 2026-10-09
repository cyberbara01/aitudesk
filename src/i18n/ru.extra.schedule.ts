// Строки виджета «Расписание» и его страницы настроек, которых нет в ru.ts. Без длинных тире.
import { LANG, type Widen } from "./lang";
import { en } from "./en/schedule";
import { plural } from "./ru";
/** Non-breaking space: keeps «в» with its word and «в 08:00» on one line. */
const NBSP = String.fromCharCode(0xa0);

/** «пара», «пары», «пар» for a count (the number is drawn separately in the week overview). */
const lessonsWord = (n: number) => plural(n, "пара", "пары", "пар");

/** «1 пара», «2 пары», «5 пар», «21 пара». */
const lessonsCount = (n: number) => `${n} ${lessonsWord(n)}`;

const RU = {
  // ---- Виджет ----
  emptyTitle: "Расписание пустое",
  /** Says what the tile will do once there are lessons (the button below adds the first one). */
  emptyHint: "Добавьте пары, и виджет покажет текущую и следующую",
  /** «через 25 мин», «через 1 ч», «через 1 ч 5 мин» (ru.schedule.startsIn yields «через 1 ч 0 мин»). */
  startsIn: (m: number) => (m < 60 ? `через ${m} мин` : m % 60 === 0 ? `через ${m / 60} ч` : `через ${Math.floor(m / 60)} ч ${m % 60} мин`),
  tomorrow: "завтра",
  /** Tooltip of a room that the map knows (the room text is a link to the map tile). */
  showOnMap: "Показать на карте",
  /** Карандаш у пары на виджете. */
  editLesson: "Изменить пару",
  /** «Ближайшая пара завтра в 08:00», «Ближайшая пара в среду в 08:00»; prepositions stay with their word. */
  nextLesson: (when: string, time: string) => `Ближайшая пара ${when.replace(/ /g, NBSP)} в${NBSP}${time}`,

  // ---- Страница настроек ----
  pageDesc:
    "Пары по дням недели. Виджет показывает выбранный день, подсвечивает текущую пару и подсказывает, когда начнётся следующая",
  perWeek: (n: number) => (n === 0 ? "Пар пока нет" : `${lessonsCount(n)} в неделю`),
  lessonsCount,
  lessonsWord,
  dayEmpty: "В этот день пар нет",
  noLessonsShort: "нет пар",
  dayEmptyHint: "Добавьте первую пару, и она сразу появится на виджете",
  dayHiddenHint: "Сейчас этот день на виджете скрыт. Он появится там, как только вы добавите пару",
  showEmptyDays: "Показывать дни без пар",
  showEmptyDaysHint: "Если выключить, на виджете останутся только дни с парами, а в свободный день откроется ближайший день с парами",
  showWeekendHint: "Сб и Вс будут в ряду дней всегда. Если выключить, выходной виден, только когда в нём есть пары",
  showWeekendOffHint: "Не действует, пока дни без пар скрыты",
  followTodayHint: "В полночь виджет возвращается на сегодняшний день, даже если вы открыли другой",
  backgroundHint: "Без фона список лежит прямо на обоях",
  clearHint: "Удалит все пары из расписания. Отменить нельзя",
  clearShort: "Очистить",
  clearTitle: "Очистить расписание?",
  clearText: "Все пары будут удалены из расписания. Отменить это нельзя.",
  inSchedule: (n: number) => `Сейчас в расписании ${lessonsCount(n)}`,

  // ---- Редактор пары ----
  colorAccent: "Как акцент",
  colorOwn: "Свой цвет",
  colorHint: "Полоса слева от пары и подпись «Сейчас»",
  overlaps: (title: string, range: string) => `Пересекается с «${title}» (${range})`,
  /** Under «Аудитория» while the map tile is on: the format the map understands and what it gives. */
  roomHint: "Например, C1.2.223 или 223. Нажмите на аудиторию на виджете, и карта покажет этот кабинет",
  endAfterStart: "Конец должен быть позже начала",
  previewHint: "Так пара будет выглядеть на виджете",
} as const;

export type ScheduleStrings = Widen<typeof RU>;
export const extra: ScheduleStrings = LANG === "en" ? en : RU;
