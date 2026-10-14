// Kazakh for src/i18n/ru.extra.schedule.ts. A noun after a number stays singular in Kazakh: «3 сабақ».
import type { ScheduleStrings } from "../ru.extra.schedule";

/** Non-breaking space: keeps «сағат» with its time on one line. */
const NBSP = String.fromCharCode(0xa0);

const lessonsWord = (_n: number) => "сабақ";
const lessonsCount = (n: number) => `${n} сабақ`;

export const kk: ScheduleStrings = {
  emptyTitle: "Сабақ кестесі бос",
  emptyHint: "Сабақтарды қосыңыз, виджет қазіргі және келесі сабақты көрсетеді",
  startsIn: (m: number) => (m < 60 ? `${m} мин кейін` : m % 60 === 0 ? `${m / 60} сағ кейін` : `${Math.floor(m / 60)} сағ ${m % 60} мин кейін`),
  tomorrow: "ертең",
  showOnMap: "Картадан көрсету",
  editLesson: "Сабақты өзгерту",
  nextLesson: (when: string, time: string) => `Келесі сабақ ${when.replace(/ /g, NBSP)} сағат${NBSP}${time}`,

  pageDesc:
    "Апта күндері бойынша сабақтар. Виджет таңдалған күнді көрсетеді, қазіргі сабақты белгілейді және келесісі қашан басталатынын айтады",
  perWeek: (n: number) => (n === 0 ? "Әзірге сабақ жоқ" : `Аптасына ${lessonsCount(n)}`),
  lessonsCount,
  lessonsWord,
  dayEmpty: "Бұл күні сабақ жоқ",
  noLessonsShort: "сабақ жоқ",
  dayEmptyHint: "Алғашқы сабақты қосыңыз, ол бірден виджетте пайда болады",
  dayHiddenHint: "Қазір бұл күн виджетте жасырулы. Сабақ қосқан бойда ол сол жерде пайда болады",
  showEmptyDays: "Сабақсыз күндерді көрсету",
  showEmptyDaysHint: "Өшірсеңіз, виджетте тек сабақ бар күндер қалады, ал бос күні сабағы бар ең жақын күн ашылады",
  showWeekendHint: "Сб мен Жс күндер қатарында әрқашан тұрады. Өшірсеңіз, демалыс күні тек онда сабақ болғанда көрінеді",
  showWeekendOffHint: "Сабақсыз күндер жасырулы тұрғанда әсер етпейді",
  followTodayHint: "Түн ортасында виджет басқа күнді ашып қойсаңыз да, бүгінгі күнге қайтады",
  backgroundHint: "Фонсыз тізім тікелей тұсқағаздың үстінде тұрады",
  clearHint: "Кестедегі барлық сабақты жояды. Қайтару мүмкін емес",
  clearShort: "Тазалау",
  clearTitle: "Кестені тазалау керек пе?",
  clearText: "Барлық сабақ кестеден жойылады. Мұны қайтару мүмкін емес.",
  inSchedule: (n: number) => `Қазір кестеде ${lessonsCount(n)}`,

  colorAccent: "Екпін түсі",
  colorOwn: "Өз түсі",
  colorHint: "Сабақтың сол жағындағы жолақ және «Қазір» деген жазу",
  overlaps: (title: string, range: string) => `«${title}» сабағымен қиылысады (${range})`,
  roomHint: "Мысалы, C1.2.223 немесе 223. Виджеттегі аудиторияны бассаңыз, карта сол кабинетті көрсетеді",
  endAfterStart: "Аяқталуы басталуынан кейін болуы керек",
  previewHint: "Сабақ виджетте осылай көрінеді",
};
