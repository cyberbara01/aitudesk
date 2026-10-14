// Kazakh for src/i18n/ru.extra.notes.ts. Short time units («күн», «сағ», «мин»), so no case endings are needed.
import type { NotesStrings } from "../ru.extra.notes";

export const kk: NotesStrings = {
  tile: {
    empty: "Жазба жоқ",
    emptyHint: "Істер мен мерзімдер осында пайда болады",
    allDone: "Бәрі орындалды",
    allDoneHint: "Орындалған жазбалар жасырулы",
    add: "Жазба қосу",
    edit: "Жазбаны өзгерту",
    markDone: "Орындалды деп белгілеу",
    markUndone: "Қайта жұмысқа қайтару",
  },

  countdown: {
    in: (rest: string) => `${rest} кейін`,
    now: "қазір",
    overdue: (rest: string) => `${rest} кешікті`,
    days: (n: number) => `${n} күн`,
    hours: (n: number) => `${n} сағ`,
    minutes: (n: number) => `${n} мин`,
  },

  dates: {
    today: "бүгін",
    tomorrow: "ертең",
    yesterday: "кеше",
    weekdaysShort: ["дс", "сс", "ср", "бс", "жм", "сб", "жс"],
    weekdaysLong: ["дүйсенбі", "сейсенбі", "сәрсенбі", "бейсенбі", "жұма", "сенбі", "жексенбі"],
    monthsShort: ["қаң", "ақп", "нау", "сәу", "мам", "мау", "шіл", "там", "қыр", "қаз", "қар", "жел"],
    monthsGenitive: ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"],
    monthsNominative: ["Қаңтар", "Ақпан", "Наурыз", "Сәуір", "Мамыр", "Маусым", "Шілде", "Тамыз", "Қыркүйек", "Қазан", "Қараша", "Желтоқсан"],
  },

  page: {
    desc: "Қысқа істер мен мерзімдер. Виджет жазбаларды көрсетеді және мерзімге дейін қанша қалғанын санайды",
    list: "Барлық жазбалар",
    sort: "Сұрыптау",
    sortHint: "Виджет жазбаларды осы ретпен көрсетеді. Өз ретіңізбен қою үшін жазбаны тінтуірмен осы жерде немесе тікелей виджетте сүйреңіз",
    sorts: {
      deadline: "Мерзім бойынша",
      newest: "Алдымен жаңалары",
      oldest: "Алдымен ескілері",
      manual: "Өз ретім",
    },
    drag: "Жазбаның орнын ауыстыру",
    dragHint: "Орнын ауыстыру үшін сүйреңіз. Пернетақтадан: Alt және жоғары не төмен көрсеткі",
    moved: (place: number, of: number) => `Жазбаның орны ауыстырылды: ${place}/${of}`,
    noReminders: "Мерзім туралы еске салусыз",
    summary: (active: number, done: number) => {
      if (active === 0) return `Бәрі орындалды: ${done} жазба`;
      if (done === 0) return `${active} орындалуда`;
      return `${active} орындалуда, ${done} орындалды`;
    },
    noDeadline: "мерзімсіз",
    emptyTitle: "Әзірге жазба жоқ",
    emptyHint: "Алғашқысын қосыңыз, ол бірден виджетте пайда болады",
    options: "Көрініс",
    showDone: "Орындалғандарды көрсету",
    showDoneHint: "Орындалған жазбалар виджетте қалады: күңгірт түрде, тізімнің соңында",
    background: "Виджет фоны",
    backgroundHint: "Фонсыз тізім тікелей тұсқағаздың үстінде тұрады",
  },

  editor: {
    newNote: "Жаңа жазба",
    editNote: "Жазбаны өзгерту",
    text: "Мәтін",
    textPlaceholder: "Не істеу керек?",
    saveHint: "Сақтау үшін Ctrl+Enter",
    counter: (n: number, max: number) => `${n}/${max}`,
    deadline: "Мерзім",
    deadlineHint: "Виджет мерзімге дейін қанша қалғанын көрсетеді",
    date: "Күні",
    time: "Уақыты",
    timePlaceholder: "СС:ММ",
    quick: "Жылдам таңдау",
    tonight: "Бүгін кешке",
    tomorrowMorning: "Ертең таңертең",
    inWeek: "Бір аптадан кейін",
    past: "Бұл уақыт өтіп кетті, жазбаның мерзімі бірден өткен болады",
    remind: "Мерзім туралы еске салу",
    remindOff: "Бұл жазба туралы хабарландыру келмейді",
    remindPlan: (plan: string, section: string) => `${plan}, «${section}» бөлімінде орнатылғандай`,
    remindGlobalOff: (section: string) => `Қазір мерзімдер туралы еске салу «${section}» бөлімінде өшірулі`,
    remindNothing: (section: string) => `«${section}» бөлімінде мерзімдер туралы қашан еске салу керегі таңдалмаған`,
    color: "Белгі түсі",
    colorHint: "Виджеттегі жазбаның жанындағы дөңгелек",
    noColor: "Түссіз",
    ownColor: "Өз түсі",
  },

  calendar: {
    placeholder: "Күнді таңдаңыз",
    label: "Күнді таңдау",
    prevMonth: "Алдыңғы ай",
    nextMonth: "Келесі ай",
  },
};
