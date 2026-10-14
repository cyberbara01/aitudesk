// Kazakh for src/i18n/ru.extra.transfer.ts.
import type { TransferStrings } from "../ru.extra.transfer";

/** Non-breaking space: keeps «немесе https://» on one line. */
const NBSP = String.fromCharCode(0xa0);

export const kk: TransferStrings = {
  desc: "Конфиг: барлық баптауларыңыз бір файлда. Өзіңіздікін сақтаңыз немесе біреудікін жүктеңіз, ал нені сақтап, нені қолдануды өзіңіз таңдайсыз",

  parts: {
    layout: "Виджеттердің орны мен өлшемдері",
  },
  personal: "Жеке",

  summary: {
    tilesAll: (n: number) => `Барлық ${n} виджет қосулы`,
    tilesSome: (on: number, total: number) => `${total} ішінен ${on} қосулы`,
    tilesNone: "Барлығы өшірулі",
    locked: "орны бекітілген",
    grid: "тор бойынша",
    inStack: (n: number) => `${n} бумада`,
    layoutExport: "Басқа өлшемді экранда виджеттер оған бейімделеді",
    layoutAdapts: "Виджеттер сіздің экраныңызға бейімделеді",
    layoutNoScreen: "Конфигте экран өлшемі көрсетілмеген, виджеттер сіздің экраныңыздың шегінде қалады",
    themeSystem: "тақырып Windows-тағыдай",
    accentWindows: "екпін түсі Windows-тағыдай",
    accentPreset: (name: string) => `«${name}» екпін түсі`,
    accentCustom: (hex: string) => `өз екпін түсі ${hex}`,
    clockPreset: (name: string) => `«${name}» стилі`,
    clockCustom: "Өз стилі",
    seconds: "секундтарымен",
    hour12: "12 сағаттық пішім",
    onlyBattery: "Тек батарея",
    and: "және",
    namesHidden: "атаулары жасырулы",
    launchersOff: "Барлық жарлық өшірулі",
    builtIn: (n: number) => `${n} кірістірілген`,
    own: (n: number) => `${n} өз`,
    launchersWord: (_n: number) => "жарлық",
    sites: (hosts: string, more: number) => (more > 0 ? `${hosts} және тағы ${more}` : hosts),
    scheme: (name: string) => `«${name}» сұлбасы`,
    opacity: (n: number) => `мөлдір еместігі ${n} %`,
    marked: (n: number) => (n === 0 ? "белгіленген кабинетсіз" : `${n} белгіленген кабинет`),
    lessons: (n: number) => (n === 0 ? "Сабақ жоқ" : `Аптасына ${n} сабақ`),
    notes: (n: number) => (n === 0 ? "Жазба жоқ" : `${n} жазба`),
    withDeadline: (n: number) => `${n} мерзімімен`,
    remindersOff: "Өшірулі",
    lessonStart: "сабақ басталғанда",
    beforeLesson: (time: string) => `сабаққа ${time} қалғанда`,
    deadlines: "мерзім жеткен сәтте",
    beforeDeadline: (time: string) => `мерзімге ${time} қалғанда`,
    minutes: (n: number) => `${n} мин`,
    hours: (n: number) => `${n} сағ`,
    days: (n: number) => `${n} күн`,
  },
  size: {
    kb: (n: string) => `${n}${NBSP}КБ`,
    mb: (n: string) => `${n}${NBSP}МБ`,
  },

  exportTitle: "Өз конфигіңізді сақтау",
  exportDesc: "Баптауларды басқа компьютерге көшіру немесе досыңызбен бөлісу үшін",
  exportList: "Нені сақтау керек",
  chosen: (n: number, total: number) => `${total} ішінен ${n} таңдалды`,
  selectAll: "Барлығын таңдау",
  clearAll: "Барлығын алып тастау",
  notesExportHint: "Конфигті басқа адамға берсеңіз, белгілемеңіз",
  customExportHint: "Суреттер конфигтің ішінде сақталады. Оны басқа адамға берсеңіз, белгілемеңіз",
  notesWarning: "Конфигте сіздің жазбаларыңыз болады. Оны басқа адамдарға жібермеңіз",
  customWarning: "Конфигте сіздің суреттеріңіз бар виджеттер болады, сондықтан файл үлкенірек болады. Оны басқа адамдарға жібермеңіз",
  bothWarning: "Конфигте сіздің жазбаларыңыз бен суреттеріңіз бар виджеттер болады, сондықтан файл үлкенірек болады. Оны басқа адамдарға жібермеңіз",
  save: "Конфигті сақтау…",
  saveTitle: "AITU Desk конфигін сақтау",
  fileName: (date: string, withNotes: boolean, withWidgets: boolean) => {
    const inside = withNotes && withWidgets ? " жазбалармен және өз виджеттерімен" : withNotes ? " жазбалармен" : withWidgets ? " өз виджеттерімен" : "";
    return `AITU Desk конфигі${inside} ${date}.json`;
  },
  saved: "Конфиг сақталды",
  savedNoLayout: "Конфиг сақталды, бірақ виджеттердің орнынсыз",
  savedWithoutWidgets: (left: number, noLayout: boolean) =>
    `Конфиг ${noLayout ? "виджеттердің орнынсыз және " : ""}${left} өз виджетінсіз сақталды: ${
      left === 1 ? "оның суреті табылмады немесе конфигке сыймады" : "олардың суреттері табылмады немесе конфигке сыймады"
    }`,
  saveFailed: "Конфигті сақтау мүмкін болмады. Басқа қалтаны таңдап көріңіз",
  showInFolder: "Қалтадан көрсету",

  importTitle: "Конфигті жүктеу",
  importDesc: "Өзіңіздікі немесе біреудікі. Нені қолдануды өзіңіз таңдайсыз, ал «Қолдану» басылғанша ештеңе өзгермейді",
  choose: "Конфигті таңдау…",
  openTitle: "AITU Desk конфигін жүктеу",
  importList: "Нені қолдану керек",
  file: (name: string) => `«${name}» файлы`,
  savedAt: (date: string, time: string) => `${date}, сағат ${time} сақталған`,
  fromVersion: (version: string) => `${version} нұсқасы`,
  storeFile: "қолданбаның жұмыс баптаулар файлы",
  replaces: (widgets: string | null) =>
    `Белгіленген бөліктер сабақтар, жазбалар, жарлықтар мен кабинеттер тізімдерімен бірге сіздікін толығымен алмастырады${
      widgets ? `. Тек «${widgets}» сіздікін алмастырмай, оларға қосылады` : ""
    }`,
  notesReplace: (n: number) => `Конфигтегі жазбалар сіздікіне қосылмай, оларды алмастырады. Қазір сізде ${n} жазба бар`,
  customAdd: "Конфигтегі виджеттер сіздікіне қосылады, өзіңіздікі қалады",
  customSome: (fit: number, total: number, max: number) =>
    `Конфигтен ${total} ішінен тек ${fit} қосылады: өз виджеттеріңіз ${max}-ден аспауы керек`,
  customHere: "Бұл виджеттер сізде бар, ештеңе қосылмайды",
  customFull: (max: number) => `Сізде ${max} өз виджетіңіз бар, конфигтен бірде-біреуі қосылмайды`,
  customPictures: (n: number, size: string) =>
    n === 1 ? `Сурет (${size}) бағдарлама қалтасына көшіріледі` : `Суреттер (${size}) бағдарлама қалтасына көшіріледі`,
  lessonsReplace: (n: number) => `Конфигтегі сабақтар сіздікін алмастырады, қазір кестеде ${n} сабақ`,
  apply: "Қолдану",
  applied: "Конфиг жүктелді",
  appliedLayoutFailed: "Конфиг жүктелді, бірақ виджеттердің орнын ауыстыру мүмкін болмады",
  applyFailed: "Баптауларды қолдану мүмкін болмады",
  layoutFailed: "Виджеттердің орнын ауыстыру мүмкін болмады",
  undo: "Болдырмау",
  undone: "Бұрынғы баптаулар қайтарылды",
  undoFailed: "Бұрынғы баптауларды қайтару мүмкін болмады",
  errors: {
    notJson: "Файлды оқу мүмкін болмады: ол бүлінген немесе бұл конфиг емес",
    foreign: "Бұл AITU Desk конфигі емес",
    newer: "Конфиг AITU Desk-тің жаңарақ нұсқасында сақталған. Оны жүктеу үшін қолданбаны жаңартыңыз",
    empty: "Конфигте жүктеуге болатын баптаулар жоқ",
    tooLarge: "Файл конфиг үшін тым үлкен",
    read: "Файлды ашу мүмкін болмады. Оны басқа бағдарлама пайдаланып тұрмағанын тексеріңіз",
  },

  aboutTitle: "Конфигтің ішінде не бар",
  plainLabel: "Қарапайым мәтін",
  plainHint: "Конфиг JSON пішімінде сақталады. Оны Блокнотта ашып, ішінде не бар екенін көруге болады",
  notIncludedLabel: "Нелер көшірілмейді",
  notIncludedHint: "Тіл, виджеттер масштабы, автоіске қосу және барлық виджетті жасыру осы компьютердегідей қалады",
  picturesLabel: "Өз виджеттеріңіздің суреттері",
  picturesHint: "Конфигтің ішінде сақталады, сондықтан олармен файл ауырырақ болады. Жүктегенде олар бағдарлама қалтасына көшіріледі",
  addressesLabel: "Жарлықтардың мекенжайлары",
  addressesHint: `Конфигтен тек мекенжайы http://${NBSP}немесе${NBSP}https:// деп басталатын жарлықтар жүктеледі, ал AITU-дың кірістірілген жарлықтары тек университет сайттарына апарады`,
  privacyLabel: "Құпиялылық",
  privacyHint: "Жүктеу жұмыс үстеліндегі мәтін мен желі атауларын жасыруды, ол сізде қосулы болса, өшірмейді",
};
