// Строки окна настроек (shell, «Общие», «Оформление», «О программе»), которых нет в ru.ts.
export const extra = {
  shell: {
    navLabel: "Разделы настроек",
  },
  general: {
    desc: "Какие плитки лежат на рабочем столе и как они себя ведут",
    desktop: "Рабочий стол",
    startup: "Запуск",
    showAllHint: "Выключите, чтобы на время убрать все плитки с рабочего стола",
    layoutLabel: "Раскладка плиток",
    resetLayoutFailed: "Не удалось сбросить раскладку",
    autostartFailed: "Не удалось изменить автозапуск. Попробуйте ещё раз",
  },
  appearance: {
    desc: "Стиль, палитра и акцент для всех плиток и этого окна",
    previewHint: "Живой предпросмотр: часы и система в выбранных стиле, теме и акценте",
    themeHint: "Палитра плиток и окна настроек",
    themeSystemHint: "Светлая или тёмная, как настроено в Windows",
    accentHint: "Цвет выделения, переключателей и индикаторов",
    accentWindowsHint: "Берётся из параметров персонализации Windows",
    accentCustomHint: "Любой цвет: палитра, RGB или HEX",
    presets: "Готовые цвета",
    sampleWifi: "AITU",
    sampleDevice: "Наушники",
  },
  about: {
    openSource: "Открытый исходный код",
    show: "Показать",
    hide: "Скрыть",
    mapLicence: "Текст лицензии aitumap",
    mapRepoLabel: "Репозиторий",
    write: "Написать",
  },
} as const;
