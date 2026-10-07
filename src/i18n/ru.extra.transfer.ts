// Строки страницы «Импорт и экспорт» (файл настроек), которых нет в ru.ts. Названия частей, которые уже есть
// в ru.ts (разделы боковой панели, «Плитки на рабочем столе»), берутся оттуда. Без длинных тире: правило автора.
import { plural } from "./ru";

const count = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`;
/** Non-breaking space: keeps «или https://» on one line. */
const NBSP = String.fromCharCode(0xa0);

export const extra = {
  desc: "Настройки в обычном файле. Вы сами выбираете, что в него сохранить и что из него применить",

  /** Части файла, которых нет среди разделов настроек. */
  parts: {
    layout: "Расположение и размеры плиток",
  },
  personal: "Личное",

  /** Что лежит в каждой части: строка под её названием в обоих списках. */
  summary: {
    tilesAll: (n: number) => `Включены все ${n}`,
    tilesSome: (on: number, total: number) => `${plural(on, "Включена", "Включены", "Включено")} ${on} из ${total}`,
    tilesNone: "Все выключены",
    locked: "расположение закреплено",
    layoutExport: "На экране другого размера плитки подстроятся под него",
    layoutAdapts: "Плитки подстроятся под ваш экран",
    layoutNoScreen: "Размер экрана в файле не указан, плитки останутся в пределах вашего",
    themeSystem: "тема как в Windows",
    accentWindows: "акцент как в Windows",
    accentPreset: (name: string) => `акцент ${name}`,
    accentCustom: (hex: string) => `свой акцент ${hex}`,
    clockPreset: (name: string) => `Стиль «${name}»`,
    clockCustom: "Свой стиль",
    seconds: "с секундами",
    hour12: "12-часовой формат",
    onlyBattery: "Только батарея",
    and: "и",
    namesHidden: "названия скрыты",
    launchersOff: "Все ярлыки выключены",
    builtIn: (n: number) => `${n} ${plural(n, "встроенный", "встроенных", "встроенных")}`,
    own: (n: number) => `${n} ${plural(n, "свой", "своих", "своих")}`,
    launchersWord: (n: number) => plural(n, "ярлык", "ярлыка", "ярлыков"),
    /** Сайты своих ярлыков после двоеточия: «github.com, web.telegram.org и ещё 2». */
    sites: (hosts: string, more: number) => (more > 0 ? `${hosts} и ещё ${more}` : hosts),
    scheme: (name: string) => `Схема «${name}»`,
    marked: (n: number) => (n === 0 ? "без отмеченных кабинетов" : count(n, "отмеченный кабинет", "отмеченных кабинета", "отмеченных кабинетов")),
    lessons: (n: number) => (n === 0 ? "Пар нет" : `${count(n, "пара", "пары", "пар")} в неделю`),
    notes: (n: number) => (n === 0 ? "Заметок нет" : count(n, "заметка", "заметки", "заметок")),
    withDeadline: (n: number) => `${n} с дедлайном`,
    remindersOff: "Выключены",
    lessonStart: "в начале пары",
    beforeLesson: (time: string) => `за ${time} до пары`,
    deadlines: "о дедлайнах",
    beforeDeadline: (time: string) => `о дедлайнах за ${time}`,
    minutes: (n: number) => `${n} мин`,
    hours: (n: number) => `${n} ч`,
    days: (n: number) => count(n, "день", "дня", "дней"),
  },

  // ---- Сохранить ----
  exportTitle: "Сохранить настройки в файл",
  exportDesc: "Чтобы перенести их на другой компьютер или поделиться с другом",
  exportList: "Что сохранить",
  chosen: (n: number, total: number) => `Выбрано ${n} из ${total}`,
  selectAll: "Выбрать всё",
  clearAll: "Снять всё",
  notesExportHint: "Не отмечайте, если отдаёте файл другому человеку",
  notesWarning: "В файле будут ваши заметки. Не отправляйте его другим людям",
  save: "Сохранить в файл…",
  saveTitle: "Сохранить настройки AITU Desk",
  /** Имя файла в окне «Сохранить»; дата «ДД.ММ.ГГГГ». */
  fileName: (date: string, withNotes: boolean) =>
    withNotes ? `AITU Desk настройки с заметками ${date}.json` : `AITU Desk настройки ${date}.json`,
  saved: "Файл сохранён",
  savedNoLayout: "Файл сохранён, но без расположения плиток",
  saveFailed: "Не удалось сохранить файл. Попробуйте выбрать другую папку",
  showInFolder: "Показать в папке",

  // ---- Загрузить ----
  importTitle: "Загрузить настройки из файла",
  importDesc: "Свой файл или файл друга. Вы выберете, что применить, и до нажатия «Применить» ничего не изменится",
  choose: "Выбрать файл…",
  openTitle: "Загрузить настройки AITU Desk",
  importList: "Что применить",
  /** Подпись над списком: имя файла, когда и где он сохранён. */
  file: (name: string) => `Файл «${name}»`,
  savedAt: (date: string, time: string) => `сохранён ${date} в ${time}`,
  fromVersion: (version: string) => `версия ${version}`,
  storeFile: "рабочий файл настроек приложения",
  replaces: "Отмеченные части заменят ваши целиком, вместе со списками пар, ярлыков и кабинетов",
  notesImportHint: "Заметки из файла заменят ваши, а не добавятся к ним",
  lessonsReplace: (n: number) => `Сейчас у вас ${count(n, "пара", "пары", "пар")}, их заменят пары из файла`,
  apply: "Применить",
  applied: "Настройки загружены",
  appliedLayoutFailed: "Настройки загружены, но плитки переставить не удалось",
  applyFailed: "Не удалось применить настройки",
  layoutFailed: "Не удалось переставить плитки",
  undo: "Отменить",
  undone: "Прежние настройки возвращены",
  undoFailed: "Не удалось вернуть прежние настройки",
  errors: {
    notJson: "Не удалось прочитать файл: он повреждён или это не файл настроек",
    foreign: "Это не файл настроек AITU Desk",
    newer: "Файл сохранён в более новой версии AITU Desk. Обновите приложение, чтобы загрузить его",
    empty: "В файле нет настроек, которые можно загрузить",
    tooLarge: "Файл слишком большой для файла настроек",
    read: "Не удалось открыть файл. Проверьте, что он не занят другой программой",
  },

  // ---- Что внутри файла ----
  aboutTitle: "Что внутри файла",
  plainLabel: "Обычный текст",
  plainHint: "Файл в формате JSON. Его можно открыть в Блокноте и посмотреть, что внутри",
  notIncludedLabel: "Что не переносится",
  notIncludedHint: "Автозапуск и скрытие всех плиток остаются такими, как на этом компьютере",
  addressesLabel: "Адреса ярлыков",
  addressesHint: `Из файла загружаются только ярлыки с адресом, который начинается с http://${NBSP}или${NBSP}https://, а встроенные ярлыки AITU ведут только на сайты университета`,
  privacyLabel: "Приватность",
  privacyHint: "Загрузка не выключает скрытие текста на рабочем столе и названий сетей, если оно у вас включено",
} as const;
