// Строки виджета «Нагрузка» и его раздела настроек (src/tiles/Perf.tsx, src/settings/PerfPage.tsx).
// Без длинных тире: правило автора.
import { LANG, type Widen } from "./lang";
import { en } from "./en/perf";

const RU = {
  /** Короткие подписи на виджете. */
  short: { cpu: "ЦП", gpu: "ГП", ram: "ОЗУ", disk: "Диск" },
  /** Полные названия в настройках и подсказках. */
  full: { cpu: "Процессор", gpu: "Видеокарта", ram: "Память", disk: "Диск" },
  modes: { rings: "Кольца", bars: "Полосы", numbers: "Числа" },
  temp: "Температура",
  /** «54°» */
  degrees: (c: number) => `${Math.round(c)}°`,
  percent: (v: number) => `${Math.round(v)}${String.fromCharCode(0x202f)}%`,
  /** Память в подсказке: «7,9 из 16 ГБ». */
  memory: (used: number, total: number) =>
    `${used.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} из ${total.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ГБ`,
  /** Подсказка над виджетом: что щелчок меняет вид. */
  cycleHint: "Щёлкните, чтобы сменить вид",
  /** Пока нет ни одного значения (первые секунды). */
  waiting: "Собираю данные",

  pageDesc: "Загрузка процессора, видеокарты, памяти и диска и их температура. Данные обновляются раз в 2 секунды и только пока виджет виден",
  previewHint: "Живой предпросмотр: настоящие значения этого компьютера",
  view: "Вид",
  viewHint: "Вид меняется и щелчком по самому виджету",
  metrics: "Показатели",
  metricsHint: "Видеокарта и диск показываются, если Windows отдаёт их загрузку",
  hints: {
    cpu: "Доля времени, которую процессор занят",
    gpu: "Самый загруженный блок видеокарты, как в диспетчере задач",
    ram: "Сколько памяти занято",
    disk: "Сколько времени занят самый загруженный диск",
  },
  tempHint:
    "Температура видеокарты берётся у её драйвера, как в диспетчере задач. Температуру процессора Windows без прав администратора отдаёт только через датчики ACPI: на ноутбуках они обычно есть, на настольных ПК часто нет, и тогда она не показывается",
  look: "Внешний вид",
  backgroundHint: "Без фона кольца и числа лежат прямо на обоях",
  /** Строка в «Конфигах». */
  summary: (mode: string, shown: string) => `${mode}: ${shown}`,
} as const;

export type PerfStrings = Widen<typeof RU>;
export const extra: PerfStrings = LANG === "en" ? en : RU;
