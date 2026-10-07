// English for src/i18n/ru.extra.system.ts.
import type { SystemStrings } from "../ru.extra.system";

export const en: SystemStrings = {
  settings: {
    system: {
      pageDesc:
        "Battery, Wi-Fi and Bluetooth in one compact widget. Choose the rows and decide whether to hide network and device names",
      previewHint: "Live preview: real values, the widget in the chosen design and theme",
      rowsHint: "The battery is always shown, the other rows can be turned off",
      showWifiHint: "Network name and signal strength",
      showBluetoothHint: "Connected devices",
      labelMode: "Label",
      labelHint: "The text at the start of the row. The battery charge or “Plugged in” stays on the right",
      userNameHint: "The name comes from your Windows account",
      userNameUnavailable: (name: string) => `The account name isn't available, so “${name}” will be shown`,
      customEmptyHint: (name: string) => `If you leave it empty, “${name}” will be shown`,
      look: "Look",
      backgroundHint: "Without the background the rows sit right on the wallpaper",
    },
  },
};
