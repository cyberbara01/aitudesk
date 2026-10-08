// Строки страницы «Конфиги» (настройки в одном файле), которых нет в ru.ts. Названия частей, которые уже есть
// в ru.ts (разделы боковой панели, «Виджеты на рабочем столе»), берутся оттуда. Без длинных тире: правило автора.
import { LANG, type Widen } from "./lang";
import { en } from "./en/transfer";
import { plural } from "./ru";

const count = (n: number, one: string, few: string, many: string) => `${n} ${plural(n, one, few, many)}`;
/** Non-breaking space: keeps «или https://» on one line. */
const NBSP = String.fromCharCode(0xa0);

const RU = {
  desc: "Конфиг: все ваши настройки в одном файле. Сохраните свой или загрузите чужой, а что именно сохранить и применить, выбираете вы",

  /** Части файла, которых нет среди разделов настроек. */
  parts: {
    layout: "Расположение и размеры виджетов",
  },
  personal: "Личное",

  /** Что лежит в каждой части: строка под её названием в обоих списках. */
  summary: {
    tilesAll: (n: number) => `Включены все ${n}`,
    tilesSome: (on: number, total: number) => `${plural(on, "Включён", "Включены", "Включено")} ${on} из ${total}`,
    tilesNone: "Все выключены",
    locked: "расположение закреплено",
    layoutExport: "На экране другого размера виджеты подстроятся под него",
    layoutAdapts: "Виджеты подстроятся под ваш экран",
    layoutNoScreen: "Размер экрана в конфиге не указан, виджеты останутся в пределах вашего",
    themeSystem: "тема как в Windows",
    accentWindows: "акцент как в Windows",
    accentPreset: (name: string) => `акцент «${name}»`,
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
    deadlines: "в момент дедлайна",
    beforeDeadline: (time: string) => `за ${time} до дедлайна`,
    minutes: (n: number) => `${n} мин`,
    hours: (n: number) => `${n} ч`,
    days: (n: number) => count(n, "день", "дня", "дней"),
  },

  // ---- Сохранить ----
  exportTitle: "Сохранить свой конфиг",
  exportDesc: "Чтобы перенести настройки на другой компьютер или поделиться ими с другом",
  exportList: "Что сохранить",
  chosen: (n: number, total: number) => `Выбрано ${n} из ${total}`,
  selectAll: "Выбрать всё",
  clearAll: "Снять всё",
  notesExportHint: "Не отмечайте, если отдаёте конфиг другому человеку",
  notesWarning: "В конфиге будут ваши заметки. Не отправляйте его другим людям",
  save: "Сохранить конфиг…",
  saveTitle: "Сохранить конфиг AITU Desk",
  /** Имя файла в окне «Сохранить»; дата «ДД.ММ.ГГГГ». */
  fileName: (date: string, withNotes: boolean) =>
    withNotes ? `Конфиг AITU Desk с заметками ${date}.json` : `Конфиг AITU Desk ${date}.json`,
  saved: "Конфиг сохранён",
  savedNoLayout: "Конфиг сохранён, но без расположения виджетов",
  savedWithoutWidgets: "Конфиг сохранён без некоторых своих виджетов: их картинки слишком большие или не найдены",
  saveFailed: "Не удалось сохранить конфиг. Попробуйте выбрать другую папку",
  showInFolder: "Показать в папке",

  // ---- Загрузить ----
  importTitle: "Загрузить конфиг",
  importDesc: "Свой или чужой. Вы выберете, что применить, и до нажатия «Применить» ничего не изменится",
  choose: "Выбрать конфиг…",
  openTitle: "Загрузить конфиг AITU Desk",
  importList: "Что применить",
  /** Подпись над списком: имя файла, когда и где он сохранён. */
  file: (name: string) => `Файл «${name}»`,
  savedAt: (date: string, time: string) => `сохранён ${date} в ${time}`,
  fromVersion: (version: string) => `версия ${version}`,
  storeFile: "рабочий файл настроек приложения",
  replaces: "Отмеченные части заменят ваши целиком, вместе со списками пар, ярлыков и кабинетов",
  notesImportHint: "Заметки из конфига заменят ваши, а не добавятся к ним",
  customImportHint: "Виджеты из конфига добавятся к вашим, ваши останутся",
  lessonsReplace: (n: number) => `Пары из конфига заменят ваши, сейчас в расписании ${count(n, "пара", "пары", "пар")}`,
  apply: "Применить",
  applied: "Конфиг загружен",
  appliedLayoutFailed: "Конфиг загружен, но виджеты переставить не удалось",
  applyFailed: "Не удалось применить настройки",
  layoutFailed: "Не удалось переставить виджеты",
  undo: "Отменить",
  undone: "Прежние настройки возвращены",
  undoFailed: "Не удалось вернуть прежние настройки",
  errors: {
    notJson: "Не удалось прочитать файл: он повреждён или это не конфиг",
    foreign: "Это не конфиг AITU Desk",
    newer: "Конфиг сохранён в более новой версии AITU Desk. Обновите приложение, чтобы загрузить его",
    empty: "В конфиге нет настроек, которые можно загрузить",
    tooLarge: "Файл слишком большой для конфига",
    read: "Не удалось открыть файл. Проверьте, что он не занят другой программой",
  },

  // ---- Что внутри файла ----
  aboutTitle: "Что внутри конфига",
  plainLabel: "Обычный текст",
  plainHint: "Конфиг хранится в формате JSON. Его можно открыть в Блокноте и посмотреть, что внутри",
  notIncludedLabel: "Что не переносится",
  notIncludedHint: "Язык, масштаб виджетов, автозапуск и скрытие всех виджетов остаются такими, как на этом компьютере",
  picturesLabel: "Картинки своих виджетов",
  picturesHint: "Хранятся внутри конфига, поэтому с ними файл весит больше. При загрузке они копируются в папку программы",
  addressesLabel: "Адреса ярлыков",
  addressesHint: `Из конфига загружаются только ярлыки с адресом, который начинается с http://${NBSP}или${NBSP}https://, а встроенные ярлыки AITU ведут только на сайты университета`,
  privacyLabel: "Приватность",
  privacyHint: "Загрузка не выключает скрытие текста на рабочем столе и названий сетей, если оно у вас включено",
} as const;

export type TransferStrings = Widen<typeof RU>;
export const extra: TransferStrings = LANG === "en" ? en : RU;
