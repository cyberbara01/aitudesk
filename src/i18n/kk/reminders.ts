// Kazakh for src/i18n/ru.extra.reminders.ts. «За 10 минут» is said as «10 минут қалғанда» (when 10 minutes are left),
// a repeat as «әр 3 сағат сайын»; a noun after a number stays singular.
import type { RemindersStrings } from "../ru.extra.reminders";

const DAY = 24 * 60;
const WEEK = 7 * DAY;

const units = {
  minutes: (_n: number) => "минут",
  hours: (_n: number) => "сағат",
  days: (_n: number) => "күн",
};

/** «15 минут», «1 сағат», «3 сағат», «2 күн», «1 апта», «2 апта». */
function span(minutes: number): string {
  if (minutes % WEEK === 0) return `${minutes / WEEK} апта`;
  if (minutes % DAY === 0) return `${minutes / DAY} күн`;
  if (minutes % 60 === 0) return `${minutes / 60} сағат`;
  return `${minutes} минут`;
}

/** «әр 15 минут сайын», «әр сағат сайын», «күніне бір рет», «әр 2 күн сайын», «аптасына бір рет». */
function every(minutes: number): string {
  if (minutes === WEEK) return "аптасына бір рет";
  if (minutes % DAY === 0) {
    const n = minutes / DAY;
    return n === 1 ? "күніне бір рет" : `әр ${n} күн сайын`;
  }
  if (minutes % 60 === 0) {
    const n = minutes / 60;
    return n === 1 ? "әр сағат сайын" : `әр ${n} сағат сайын`;
  }
  return minutes === 1 ? "әр минут сайын" : `әр ${minutes} минут сайын`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The plan for one deadline, as the note editor says it: «Мерзімге 1 күн қалғанда, содан кейін әр 3 сағат сайын және мерзім жеткен сәтте». */
export function deadlinePlanKk(first: number, repeat: number, atDeadline: boolean): string {
  const parts: string[] = [];
  if (first > 0) parts.push(`мерзімге ${span(first)} қалғанда${repeat > 0 ? `, содан кейін ${every(repeat)}${atDeadline ? "" : " мерзімге дейін"}` : ""}`);
  if (atDeadline) parts.push("мерзім жеткен сәтте");
  return cap(parts.join(" және "));
}

export const kk: RemindersStrings = {
  pageDesc: "Сабақтар мен жазбалардың мерзімдері алдындағы Windows хабарландырулары. Олардың қашан және қаншалықты жиі келетіні осы жерде таңдалады",

  units,

  lessons: {
    title: "Сабақтар",
    desc: "Кестедегі әр сабақтың алдында",
    on: "Сабақтар туралы еске салу",
    onHint: "Хабарландыруда сабақтың атауы мен аудиториясы",
    onHintPrivate: "Кестеде мазмұнды жасыру қосулы, сондықтан хабарландыруда сабақтың атауы мен аудиториясы болмайды",
    before: "Сабақ басталуына қанша минут қалғанда",
    preset: (m: number) => (m === 0 ? "Сабақ басталғанда" : cap(span(m))),
    beforeHint: (lesson: string, at: string) => `Мысалы, сағат ${lesson} басталатын сабақ туралы хабарландыру сағат ${at} келеді`,
    beforeHintEve: (lesson: string, at: string) => `Мысалы, сағат ${lesson} басталатын сабақ туралы хабарландыру алдыңғы күні сағат ${at} келеді`,
    beforeHintStart: "Хабарландыру сабақ басталған сәтте келеді",
    customLead: "Басталуына",
    customTail: "қалғанда",
    customLabel: "Сабақ басталуына дейінгі минуттар",
    range: "0 мен 180 минут аралығында болады",
    empty: "Кестеде әзірге сабақ жоқ",
    emptyHint: "Сабақтарды қосқан бойда еске салғыштар келе бастайды",
    open: "Кестені ашу",
  },

  deadlines: {
    title: "Жазбалардың мерзімдері",
    desc: "Мерзімі бар, орындалмаған жазбалар үшін. Жеке жазбаның еске салғыштарын оның редакторында өшіруге болады",
    on: "Мерзімдер туралы еске салу",
    onHint: "Хабарландыруда жазбаның бірінші жолы",
    onHintPrivate: "Жазбаларда мазмұнды жасыру қосулы, сондықтан хабарландыруда жазбаның мәтіні болмайды",
    first: "Бірінші еске салу",
    firstPreset: (m: number) => (m === 0 ? "Алдын ала еске салмау" : `${cap(span(m))} қалғанда`),
    firstLead: "Мерзімге",
    firstTail: "қалғанда",
    firstLabel: "Бірінші еске салу уақыты",
    firstRange: "1 минуттан 14 күнге дейін болады",
    repeat: "Қайталау",
    repeatHint: "Бірінші еске салудан кейін мерзімнің өзіне дейін",
    repeatNoFirst: "Қайталау бірінші еске салудан кейін басталады, ал ол таңдалмаған",
    repeatNever: "Аралық бірінші еске салудан мерзімге дейінгі уақыттан қысқа емес, сондықтан қайталау болмайды",
    repeatPreset: (m: number) => (m === 0 ? "Қайталамау" : cap(every(m))),
    repeatLead: "Әр",
    repeatTail: "сайын",
    repeatLabel: "Қайталау аралығы",
    repeatRange: "1 минуттан 7 күнге дейін болады",
    unit: "Уақыт бірлігі",
    at: "Мерзім жеткен сәтте",
    atHint: "Мерзім жеткенде тағы бір хабарландыру",
    empty: "Әзірге мерзімі бар жазба жоқ",
    emptyHint: "Жазбаға мерзім қойыңыз, сонда ол туралы еске салғыш келеді",
    open: "Жазбаларды ашу",
  },

  example: {
    dayTime: (day: string, time: string) => `${day} сағат ${time}`,
    time: (time: string) => `сағат ${time}`,
    timeOnDay: (time: string, day: string) => `${day} сағат ${time}`,
    early: (minutes: number) => `${span(minutes)} бұрын`,
    every,
    text: (deadline: string, first: string, repeat: string | null, at: string | null) => {
      let plan = first;
      if (repeat) plan += `, содан кейін ${repeat}${at ? "" : " мерзімнің өзіне дейін"}`;
      if (at) plan += ` және ${at}`;
      return `Мысалы, мерзім ${deadline} болса: ${plan}.`;
    },
    only: (deadline: string, time: string) => `Мысалы, мерзім ${deadline} болса: бір хабарландыру, дәл сағат ${time}.`,
    total: (n: number) => `Барлығы ${n} хабарландыру`,
    quietSome: (q: number) => `, оның ${q} тыныш сағаттарға түседі`,
    quietAll: (n: number) => (n === 1 ? ", тыныш сағаттарға түседі" : ", барлығы тыныш сағаттарға түседі"),
    none: "Мұндай баптаулармен мерзімдер туралы еске салу болмайды. Бірінші еске салуды таңдаңыз немесе мерзім жеткен сәттегі хабарландыруды қосыңыз",
  },

  general: {
    title: "Жалпы",
    desc: "Хабарландырулар AITU Desk іске қосулы тұрғанда келеді. Windows-тағы «Мазаламау» режимі оларды жасыруы мүмкін",
    sound: "Хабарландыру дыбысы",
    soundHint: "Хабарландырумен бірге Windows-тың қысқа сигналы",
    quiet: "Тыныш сағаттар",
    quietHint: "Бұл уақытта еске салғыштар шықпайды және дыбыс бермейді, бірақ Windows хабарландыру орталығында қалады",
    from: "Басы",
    to: "соңы",
    fromLabel: "Тыныш сағаттардың басы",
    toLabel: "Тыныш сағаттардың соңы",
    timePlaceholder: "СС:ММ",
    duration: (h: number, m: number) => (h && m ? `${h} сағ ${m} мин` : h ? `${h} сағ` : `${m} мин`),
    daily: (duration: string) => `Күн сайын, ${duration}`,
    overnight: (duration: string) => `Күн сайын түн ортасынан өтіп, ${duration}`,
    same: "Басы мен соңы бірдей, сондықтан тыныш сағаттар әсер етпейді",
    lessonsQuiet: (n: number) => `Сабақтар туралы аптасына ${n} еске салғыш тыныш сағаттарға түседі`,
    test: "Сынақ хабарландыруы",
    testHint: "Ол шықпаса, Windows параметрлерінен AITU Desk хабарландыруларын және «Мазаламау» режимін тексеріңіз",
    testButton: "Хабарландыруды тексеру",
    testDone: "Хабарландыру жіберілді",
    testFailed: "Хабарландыруды көрсету мүмкін болмады",
    autostartOff: "Автоіске қосу өшірулі",
    autostartOffHint:
      "Еске салғыштар тек AITU Desk іске қосулы тұрғанда келеді. Компьютер қайта қосылғаннан кейін жоғалмауы үшін автоіске қосуды қосыңыз",
    autostartOn: "Автоіске қосуды қосу",
  },
  resetText:
    "Еске салғыштар бастапқы күйге қайтады: сабаққа 10 минут қалғанда, мерзімге 1 күн қалғанда және мерзім жеткен сәтте, дыбыспен және тыныш сағаттарсыз. Еске салғыштары өшірулі жазбалар оларсыз қалады.",
};
