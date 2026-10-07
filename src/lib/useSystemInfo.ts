// Battery, Wi-Fi and Bluetooth for the «Система» tile and its settings preview.
//
// One poller per window, shared by every component that asks (useSyncExternalStore). get_power runs every
// 30 s, get_wifi and get_bluetooth every 10 s, and only for the rows that are shown. Nothing runs while the
// window is hidden or while no consumer is active (the settings preview pauses when it is scrolled away).
// There is no heartbeat timer: each poll tick compares the time it fired with the time it was planned for,
// and a tick more than SLEEP_GAP late means the machine slept, so everything is refreshed at once. Becoming
// visible again refreshes everything too.
import { useEffect, useState, useSyncExternalStore } from "react";
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

type Kind = keyof SystemInfo;
const KINDS: readonly Kind[] = ["power", "wifi", "bluetooth"];
const COMMAND: Record<Kind, string> = { power: "get_power", wifi: "get_wifi", bluetooth: "get_bluetooth" };

const POWER_INTERVAL = 30_000;
const NET_INTERVAL = 10_000;
/** A tick this much later than planned means the timers were frozen: the machine slept. */
const SLEEP_GAP = 5_000;
/** A value fetched less than this ago is not fetched again on a refresh-all (window shown, wake-up). */
const FRESH = 2_000;

/** A timer chain: one setTimeout at a time, re-armed after every tick. */
interface Chain {
  kinds: readonly Kind[];
  interval: number;
  timer: number;
  /** Date.now() the pending tick is planned for. */
  due: number;
}

const chains: readonly Chain[] = [
  { kinds: ["power"], interval: POWER_INTERVAL, timer: 0, due: 0 },
  { kinds: ["wifi", "bluetooth"], interval: NET_INTERVAL, timer: 0, due: 0 },
];

let snapshot: SystemInfo = { power: null, wifi: null, bluetooth: null };
const listeners = new Set<() => void>();
/** How many active consumers need each value. */
const demand: Record<Kind, number> = { power: 0, wifi: 0, bluetooth: 0 };
/** Date.now() of the last fetch start per value (0 = never). */
const fetchedAt: Record<Kind, number> = { power: 0, wifi: 0, bluetooth: 0 };
const inFlight: Record<Kind, boolean> = { power: false, wifi: false, bluetooth: false };
let watchingVisibility = false;

const wanted = (k: Kind) => demand[k] > 0;
const hidden = () => document.visibilityState === "hidden";

function fetchKind(kind: Kind) {
  if (inFlight[kind]) return;
  inFlight[kind] = true;
  fetchedAt[kind] = Date.now();
  invoke<SystemInfo[Kind]>(COMMAND[kind])
    .then((value) => {
      snapshot = { ...snapshot, [kind]: value } as SystemInfo;
      listeners.forEach((fn) => fn());
    })
    .catch(() => undefined) // keep the last known value
    .finally(() => {
      inFlight[kind] = false;
    });
}

function stop(c: Chain) {
  window.clearTimeout(c.timer);
  c.timer = 0;
}

function schedule(c: Chain, delay: number) {
  stop(c);
  c.due = Date.now() + delay;
  c.timer = window.setTimeout(() => tick(c), delay);
}

function tick(c: Chain) {
  c.timer = 0;
  if (Date.now() - c.due > SLEEP_GAP) {
    refreshAll();
    return;
  }
  c.kinds.filter(wanted).forEach(fetchKind);
  schedule(c, c.interval);
}

/** (Re)start a chain after its demand changed: fetch what is stale now, then tick when the oldest value is due. */
function start(c: Chain) {
  const kinds = c.kinds.filter(wanted);
  if (!kinds.length || hidden()) {
    stop(c);
    return;
  }
  const now = Date.now();
  let wait = c.interval;
  for (const k of kinds) {
    const age = now - fetchedAt[k];
    if (age >= c.interval) fetchKind(k);
    else wait = Math.min(wait, c.interval - age);
  }
  schedule(c, wait);
}

/** Woke up or shown again: everything that is needed, at once, then the regular rhythm. */
function refreshAll() {
  const now = Date.now();
  for (const c of chains) {
    const kinds = c.kinds.filter(wanted);
    if (!kinds.length || hidden()) {
      stop(c);
      continue;
    }
    for (const k of kinds) if (now - fetchedAt[k] >= FRESH) fetchKind(k);
    schedule(c, c.interval);
  }
}

function onVisibility() {
  if (hidden()) chains.forEach(stop);
  else refreshAll();
}

/** Demand for these values changed: restart the chains that carry them; watch visibility while anything is needed. */
function sync(changed: readonly Kind[]) {
  for (const c of chains) if (c.kinds.some((k) => changed.includes(k))) start(c);
  const any = KINDS.some(wanted);
  if (any !== watchingVisibility) {
    if (any) document.addEventListener("visibilitychange", onVisibility);
    else document.removeEventListener("visibilitychange", onVisibility);
    watchingVisibility = any;
  }
}

function acquire(needs: Record<Kind, boolean>): () => void {
  const taken = KINDS.filter((k) => needs[k]);
  taken.forEach((k) => demand[k]++);
  sync(taken);
  return () => {
    taken.forEach((k) => demand[k]--);
    sync(taken);
  };
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const getSnapshot = () => snapshot;

export interface SystemInfoNeeds {
  /** Poll get_wifi (the Wi-Fi row is shown). */
  wifi: boolean;
  /** Poll get_bluetooth (the Bluetooth row is shown). */
  bluetooth: boolean;
  /** False pauses this consumer (a preview scrolled out of view, settings not loaded yet); the last values stay. */
  active?: boolean;
}

/**
 * The latest battery / Wi-Fi / Bluetooth values of this window's shared poller. Power is always polled for an
 * active consumer; Wi-Fi and Bluetooth only when asked. Values not fetched yet are null.
 */
export function useSystemInfo({ wifi, bluetooth, active = true }: SystemInfoNeeds): SystemInfo {
  const info = useSyncExternalStore(subscribe, getSnapshot);
  useEffect(() => {
    if (!active) return;
    return acquire({ power: true, wifi, bluetooth });
  }, [wifi, bluetooth, active]);
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
