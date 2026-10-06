// Строки раздела «Ярлыки», которых нет в ru.ts: плитка, страница настроек, редактор ярлыка и выбор иконки.

/** Русское склонение по числу: 1 иконка · 2 иконки · 5 иконок (11–14 — как «много»). */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.trunc(n)) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

const icons = (n: number) => `${n} ${pluralRu(n, "иконка", "иконки", "иконок")}`;
const launchers = (n: number) => `${n} ${pluralRu(n, "ярлык", "ярлыка", "ярлыков")}`;

export const extra = {
  // Страница
  description: "Быстрые ссылки на сайты университета и ваши любимые страницы в один клик с рабочего стола",
  preview: "Так плитка выглядит на рабочем столе",
  builtInHint: "Сайты AITU. Любой можно выключить или перекрасить",
  customHint: "Любые сайты: своё имя, адрес, иконка и цвет",
  noCustomHint: "Нажмите «Добавить ярлык», укажите имя и адрес, а иконку сайта мы подберём сами",
  display: "Отображение",
  showLabelsHint: "Имя под каждой иконкой",
  backgroundHint: "Без фона иконки лежат прямо на обоях",
  colorOf: (name: string) => `Цвет ярлыка «${name}»`,
  moveUp: "Выше",
  moveDown: "Ниже",

  // Плитка
  more: "Ещё",
  hiddenLaunchers: (n: number) => `Ещё ${launchers(n)}`,
  /** ПКМ по встроенному ярлыку: он не удаляется, а выключается (вернуть можно в настройках). */
  menuColor: "Цвет…",
  menuTurnOff: "Выключить ярлык",

  // Редактор
  untitled: "Новый ярлык",
  siteIconReady: "Иконка сайта загружена",
  saveAnyway: "Нажмите «Сохранить» ещё раз, чтобы оставить букву, или выберите иконку из набора",
  letterHint: "Первая буква имени в цветном квадрате",
  fluentHint: (n: number) => `Набор Fluent: ${icons(n)} на любой случай`,

  // Выбор иконки
  popular: "Популярные",
  allIconsCount: (n: number) => `Все иконки · ${n}`,
  moreIcons: (n: number) => `Ещё ${icons(n)} в полном наборе`,
  iconsFound: (n: number) => `Найдено: ${icons(n)}`,
  searchEmptyHint: "Названия на английском: например, book, music или rocket",
  /** Статичная часть строки состояния; имя иконки идёт отдельным моноширинным фрагментом. */
  selectedIcon: "Выбрана:",
} as const;
