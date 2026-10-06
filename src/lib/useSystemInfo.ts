import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Mirrors `PowerInfo` in src-tauri/src/sysinfo.rs. */
export interface PowerInfo {
  hasBattery: boolean;
  /** 0..100; null when Windows reports the level as unknown. */
  percent: number | null;
  charging: boolean;
  onAc: boolean;
}

/** Mirrors `WifiInfo` in src-tauri/src/sysinfo.rs. */
export interface WifiInfo {
  connected: boolean;
  ssid: string | null;
  /** 0..5 signal bars; null when unknown. */
  bars: number | null;
  /** Connected, but Windows hides the SSID (24H2 without location permission). */
  ssidHidden: boolean;
}

/** Mirrors `BluetoothInfo` in src-tauri/src/sysinfo.rs. */
export interface BluetoothInfo {
  /** Adapter present and radio on. */
  available: boolean;
  devices: string[];
}

/** `null` = not fetched yet. */
export interface SystemInfo {
  power: PowerInfo | null;
  wifi: WifiInfo | null;
  bluetooth: BluetoothInfo | null;
}

const POWER_INTERVAL = 30_000;
const NET_INTERVAL = 10_000;
const HEARTBEAT = 1_000;
/** A heartbeat gap above this means the machine slept: refresh everything at once. */
const SLEEP_GAP = 5_000;

const EMPTY: SystemInfo = { power: null, wifi: null, bluetooth: null };

/** Polls get_power (30 s) and get_wifi + get_bluetooth (10 s); first fetch immediately; refreshes after sleep and when the window becomes visible. */
export function useSystemInfo(): SystemInfo {
  const [info, setInfo] = useState<SystemInfo>(EMPTY);

  useEffect(() => {
    let alive = true;
    let powerBusy = false;
    let netBusy = false;

    const fetchPower = async () => {
      if (powerBusy) return;
      powerBusy = true;
      try {
        const power = await invoke<PowerInfo>("get_power");
        if (alive) setInfo((s) => ({ ...s, power }));
      } catch {
        /* keep the last known value */
      } finally {
        powerBusy = false;
      }
    };

    const fetchNet = async () => {
      if (netBusy) return;
      netBusy = true;
      const [wifi, bluetooth] = await Promise.allSettled([
        invoke<WifiInfo>("get_wifi"),
        invoke<BluetoothInfo>("get_bluetooth"),
      ]);
      netBusy = false;
      if (!alive) return;
      setInfo((s) => ({
        ...s,
        wifi: wifi.status === "fulfilled" ? wifi.value : s.wifi,
        bluetooth: bluetooth.status === "fulfilled" ? bluetooth.value : s.bluetooth,
      }));
    };

    const refreshAll = () => {
      void fetchPower();
      void fetchNet();
    };
    refreshAll();

    const powerTimer = window.setInterval(fetchPower, POWER_INTERVAL);
    const netTimer = window.setInterval(fetchNet, NET_INTERVAL);

    let last = Date.now();
    const heartbeat = window.setInterval(() => {
      const now = Date.now();
      if (now - last > SLEEP_GAP) refreshAll();
      last = now;
    }, HEARTBEAT);

    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      window.clearInterval(powerTimer);
      window.clearInterval(netTimer);
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return info;
}

// ---------------------------------------------------------------------------------------------
// Windows account name (first row of the tile on a PC without a battery, labelMode = "user")
// ---------------------------------------------------------------------------------------------

/** Resolved once per window; "" when Windows does not report a name. */
let userNameCache: string | null = null;
let userNamePending: Promise<string> | null = null;

/** `get_user_name`, invoked at most once per window; never rejects. */
export function fetchUserName(): Promise<string> {
  if (userNameCache !== null) return Promise.resolve(userNameCache);
  if (!userNamePending) {
    userNamePending = invoke<string>("get_user_name")
      .then((n) => (typeof n === "string" ? n.trim() : ""))
      .catch(() => "")
      .then((n) => {
        userNameCache = n;
        return n;
      });
  }
  return userNamePending;
}

/**
 * Account name for the tile and the settings page. `null` while unresolved (or when `enabled` is false),
 * "" when unavailable. The native call happens once per window, no matter how many components ask.
 */
export function useUserName(enabled = true): string | null {
  const [name, setName] = useState<string | null>(enabled ? userNameCache : null);

  useEffect(() => {
    if (!enabled) return;
    if (userNameCache !== null) {
      setName(userNameCache);
      return;
    }
    let alive = true;
    fetchUserName().then((n) => {
      if (alive) setName(n);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return enabled ? name : null;
}
