// Строки виджета «Система» и его страницы настроек, которых нет в ru.ts.
import { LANG, type Widen } from "./lang";
import { en } from "./en/system";
const RU = {
  settings: {
    system: {
      pageDesc: "Батарея, Wi-Fi и Bluetooth в одном компактном виджете. Выберите строки и решите, скрывать ли названия сетей и устройств",
      previewHint: "Живой предпросмотр: значения настоящие, виджет в выбранных дизайне и теме",
      rowsHint: "Батарея показывается всегда, остальные строки можно убрать",
      showWifiHint: "Имя сети и уровень сигнала",
      showBluetoothHint: "Подключённые устройства",
      labelMode: "Подпись",
      labelHint: "Надпись в начале строки. Справа остаются заряд батареи или «От сети»",
      userNameHint: "Имя берётся из учётной записи Windows",
      userNameUnavailable: (name: string) => `Имя учётной записи недоступно, поэтому будет показано «${name}»`,
      customEmptyHint: (name: string) => `Если оставить пустым, будет показано «${name}»`,
      look: "Внешний вид",
      backgroundHint: "Без фона строки лежат прямо на обоях",
    },
  },
} as const;

export type SystemStrings = Widen<typeof RU>;
export const extra: SystemStrings = LANG === "en" ? en : RU;
