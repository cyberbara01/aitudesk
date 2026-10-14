// Строки виджета «Календарь» и его раздела настроек (src/tiles/Calendar.tsx, src/settings/CalendarPage.tsx).
// Без длинных тире: правило автора.
import { LANG, type Widen } from "./lang";
import { plural } from "./ru";
import { en } from "./en/calendar";
import { kk } from "./kk/calendar";

const RU = {
  /** Дни недели над сеткой, с понедельника. */
  weekdays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const,
  weekdaysShort: ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const,
  weekdaysLong: ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"] as const,
  months: ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"] as const,
  monthsGenitive: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"] as const,
  /** Над столбцом номеров недель. */
  weekColumn: "№",
  week: (n: number) => `Неделя ${n}`,
  prev: "Предыдущий месяц",
  next: "Следующий месяц",
  backToday: "Вернуться к сегодня",
  /** Строка дня: «пт, 16 октября · 2 пары · Сдать лабораторную». */
  dayTitle: (weekday: string, day: number, month: string) => `${weekday}, ${day} ${month}`,
  dayDate: (day: number, month: string) => `${day} ${month}`,
  /** Меню дня: новая заметка или напоминание с дедлайном на этот день. */
  addNote: (day: string) => `Заметка на ${day}`,
  addReminder: (day: string) => `Напоминание на ${day}`,
  lessons: (n: number) => (n === 0 ? "нет пар" : `${n} ${plural(n, "пара", "пары", "пар")}`),
  moreDeadlines: (n: number) => `ещё ${n}`,
  /** Дедлайн, когда тексты заметок скрыты. */
  hiddenDeadline: "дедлайн",
  /** Для экранного диктора: день сетки. */
  dayAria: (long: string, deadlines: number) => (deadlines > 0 ? `${long}, ${deadlines} ${plural(deadlines, "дедлайн", "дедлайна", "дедлайнов")}` : long),
  todayAria: "сегодня",

  pageDesc: "Месяц с отмеченным сегодняшним днём и дедлайнами заметок. Если сделать виджет низким, он покажет текущую неделю",
  preview: "Так выглядит виджет",
  view: "Вид",
  titleSection: "Заголовок",
  titleFormat: "Вид",
  dayFormat: "Вид даты",
  weekNumbers: "Номера недель",
  weekNumbersHint: "Слева от каждой недели её номер, а у низкого виджета с одной неделей «Неделя 42» в заголовке. Удобно, если пары идут по чётным и нечётным неделям",
  otherDays: "Дни соседних месяцев",
  otherDaysHint: "Сетка начинается и заканчивается днями прошлого и следующего месяца, они бледнее",
  todayStyle: "Отметка сегодняшнего дня",
  todayStyles: { circle: "Круг", square: "Квадрат", ring: "Обводка" },
  deadlines: "Дедлайны заметок",
  deadlinesHint: "Точка под днём, на который в заметках стоит дедлайн",
  dayLine: "Строка дня",
  dayLineHint: "Под месяцем: пары и дедлайны выбранного дня. Щёлкните по дню на виджете, чтобы выбрать его",
  dayLineShow: "Показывать под месяцем",
  colors: "Цвета календаря",
  colorsHint: "Сегодняшний день, выходные и точки дедлайнов. Цвета текста и значков и фон задаются ниже и в «Оформлении»",
  todayColor: "Сегодня",
  weekendColor: "Выходные",
  deadlineColor: "Точки дедлайнов",
  tints: { accent: "Акцент", custom: "Свой цвет", text: "Как текст" },
  background: "Фон виджета",
  backgroundHint: "Без фона месяц лежит прямо на обоях",
  /** Строка в «Конфигах». */
  summary: (today: string, marks: string) => `Отметка «${today}»${marks ? `, ${marks}` : ""}`,
  summaryDeadlines: "дедлайны",
  summaryWeeks: "номера недель",
} as const;

export type CalendarStrings = Widen<typeof RU>;
export const extra: CalendarStrings = LANG === "en" ? en : LANG === "kk" ? kk : RU;
