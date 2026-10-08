// Строки виджета «Нагрузка» и его раздела настроек (src/tiles/Perf.tsx, src/settings/PerfPage.tsx).
// Без длинных тире: правило автора.
import { LANG, type Widen } from "./lang";
import { en } from "./en/perf";

const RU = {
  /** Короткие подписи на виджете. */
  short: { cpu: "ЦП", gpu: "ГП", ram: "ОЗУ", disk: "Диск" },
  /** Полные названия в настройках и подсказках. */
  full: { cpu: "Процессор", gpu: "Видеокарта", ram: "Память", disk: "Диск" },
  modes: { rings: "Кольца", bars: "Полосы", numbers: "Числа", line: "Строка" },
  temp: "Температура",
  /** «54°», а в Фаренгейтах «129°F». */
  degrees: (c: number, fahrenheit = false) => (fahrenheit ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°`),
  percent: (v: number) => `${Math.round(v)}${String.fromCharCode(0x202f)}%`,
  /** Память в подсказке: «7,9 из 16 ГБ». */
  memory: (used: number, total: number) =>
    `${used.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} из ${total.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ГБ`,
  /** Подсказка над виджетом: что щелчок меняет вид. */
  cycleHint: "Щёлкните, чтобы сменить вид",
  /** Пока нет ни одного значения (первые секунды). */
  waiting: "Собираю данные",

  pageDesc: "Загрузка процессора, видеокарты, памяти и диска и их температура. Данные обновляются, только пока виджет виден",
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
  tempHint: "Процессора и видеокарты. Видеокарта сообщает её через свой драйвер, как в диспетчере задач",
  units: "Единицы температуры",
  unitOptions: { c: "°C", f: "°F" },
  cpuTemp: "Температура процессора",
  cpuTempWindows: "Берётся из датчиков Windows",
  cpuTempFrom: (name: string) => `Берётся из ${name}`,
  cpuTempNone:
    "Windows не сообщает её на этом компьютере, так у большинства настольных ПК. Она появится, если запустить программу мониторинга: LibreHardwareMonitor, HWiNFO, Core Temp, MSI Afterburner или AIDA64 (в HWiNFO и AIDA64 включите в настройках общую память, Shared Memory). Ничего устанавливать в AITU Desk не нужно",
  cpuTempWaiting: "Ищу источник",
  sources: {
    librehardwaremonitor: "LibreHardwareMonitor",
    openhardwaremonitor: "OpenHardwareMonitor",
    hwinfo: "HWiNFO",
    coretemp: "Core Temp",
    afterburner: "MSI Afterburner",
    aida64: "AIDA64",
  },
  look: "Внешний вид",
  backgroundHint: "Без фона кольца и числа лежат прямо на обоях",
  color: "Цвет",
  colorHint: "Акцент, цвет по нагрузке (зелёный, жёлтый, красный) или у каждого показателя свой",
  colors: { accent: "Акцент", load: "По нагрузке", metric: "Разные" },
  thickness: "Толщина",
  thicknessHint: "Колец и полос",
  thicknesses: { thin: "Тонкие", normal: "Обычные", thick: "Толстые" },
  labels: "Подписи",
  labelsHint: "ЦП, ГП, ОЗУ и Диск рядом со значениями",
  alert: "Красный цвет",
  alertHint: "Показатель краснеет, когда нагрузка выше порога",
  alertOff: "Нет",
  update: "Обновление",
  interval: "Как часто",
  intervalHint: "Реже значит меньше нагрузки и расхода заряда. В режиме экономии заряда не чаще раза в 5 секунд",
  seconds: (n: number) => `${n} с`,
  /** Строка в «Конфигах». */
  summary: (mode: string, shown: string) => `${mode}: ${shown}`,
} as const;

export type PerfStrings = Widen<typeof RU>;
export const extra: PerfStrings = LANG === "en" ? en : RU;
