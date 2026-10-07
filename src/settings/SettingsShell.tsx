// Settings window (label "settings"): sidebar with brand + navigation, scrolling content with one page.
// Initial tab from ?tab=&edit=, later from the "settings-navigate" event; arrow keys move within the sidebar.
// The window starts hidden and is shown once its first real frame is ready (src/lib/ready.ts); pages render
// only after the stored settings are loaded. The first time the window opens on «Общие», it shows the
// welcome page instead; «Как пользоваться» at the bottom of the sidebar opens it again later.
import { Fragment, useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.shell";
import { settings } from "../lib/settings";
import { useSettingsLoaded } from "../lib/useSettings";
import { AboutPage } from "./AboutPage";
import { AppearancePage } from "./AppearancePage";
import { ClockPage } from "./ClockPage";
import { GeneralPage } from "./GeneralPage";
import { LaunchersPage } from "./LaunchersPage";
import { MapPage } from "./MapPage";
import { SchedulePage } from "./SchedulePage";
import { NotesPage } from "./NotesPage";
import { RemindersPage } from "./RemindersPage";
import { SystemPage } from "./SystemPage";
import { TransferPage } from "./TransferPage";
import { useRootAttribute, useSettled } from "./shell/hooks";
import { LanguageSwitch } from "./shell/LanguageSwitch";
import { NavigateContext, TABS, acceptsEdit, readInitialRoute, type PageId, type Route, type TabId } from "./shell/nav";
import { useNavigateEvent } from "./shell/useNavigateEvent";
import { WelcomePage } from "./shell/WelcomePage";

function renderPage(route: Route) {
  switch (route.tab) {
    case "welcome":
      return <WelcomePage />;
    case "general":
      return <GeneralPage />;
    case "appearance":
      return <AppearancePage />;
    case "clock":
      return <ClockPage />;
    case "system":
      return <SystemPage />;
    case "launchers":
      // Remount on every navigate-with-edit so the same launcher can be opened twice in a row.
      return <LaunchersPage key={`launchers-${route.nonce}`} editId={route.edit} />;
    case "map":
      return <MapPage />;
    case "schedule":
      return <SchedulePage key={`schedule-${route.nonce}`} editId={route.edit} />;
    case "notes":
      return <NotesPage key={`notes-${route.nonce}`} editId={route.edit} />;
    case "reminders":
      return <RemindersPage />;
    case "transfer":
      return <TransferPage />;
    case "about":
      return <AboutPage />;
  }
}

/** Sidebar order for the arrow keys: the tabs, then «Как пользоваться» at the bottom. */
const NAV_ORDER: readonly PageId[] = [...TABS.map((t) => t.id), "welcome"];

export function SettingsWindow() {
  const [route, setRoute] = useState<Route>(readInitialRoute);
  // Page fade only after the first user-driven switch (nothing animates at startup).
  const [animate, setAnimate] = useState(false);
  const loaded = useSettingsLoaded();
  // The sidebar may paint before the stored palette is applied to <html>; until that palette has been in
  // place for a moment, transitions are off, so nothing fades from the default look when the window appears.
  const settled = useSettled(useRootAttribute("data-theme") !== null);
  const contentRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // First open on «Общие» (a manual launch or the tray) before the welcome page was ever finished: show it
  // instead. Decided once, while rendering the first frame with the stored settings, so «Общие» never
  // flashes first. A window opened on a tile's own page (its menu) shows that page.
  const [welcomeChecked, setWelcomeChecked] = useState(false);
  if (loaded && !welcomeChecked) {
    setWelcomeChecked(true);
    if (!settings.get().onboarded && route.tab === "general") setRoute({ tab: "welcome", edit: null, nonce: route.nonce });
  }

  const current = useRef(route);
  useLayoutEffect(() => {
    current.current = route;
  });

  const go = useCallback((tab: PageId, edit: string | null = null) => {
    // Leaving the welcome page in any way («Начать», a shortcut, the sidebar) means it has been seen.
    if (current.current.tab === "welcome" && tab !== "welcome" && !settings.get().onboarded) {
      void settings.update({ onboarded: true });
    }
    setAnimate(true);
    setRoute((prev) => {
      const e = acceptsEdit(tab) ? edit : null;
      return { tab, edit: e, nonce: e ? prev.nonce + 1 : prev.nonce };
    });
  }, []);

  // Launching the app again while the welcome page is open asks for «Общие»: the welcome page stays.
  const onNavigateEvent = useCallback(
    (tab: TabId, edit: string | null) => {
      if (current.current.tab === "welcome" && tab === "general" && !edit) return;
      go(tab, edit);
    },
    [go],
  );
  useNavigateEvent(onNavigateEvent);

  useLayoutEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [route.tab]);

  const onNavKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    // The language button has its own keys (its menu and its dialog).
    if ((e.target as HTMLElement).closest(".lang-switch")) return;
    const i = NAV_ORDER.indexOf(route.tab);
    const n = NAV_ORDER.length;
    let next: number;
    if (e.key === "ArrowDown") next = (i + 1) % n;
    else if (e.key === "ArrowUp") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else return;
    e.preventDefault();
    const id = NAV_ORDER[next];
    go(id);
    navRef.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus();
  };

  const navButton = (id: PageId, icon: string, label: string) => {
    const selected = id === route.tab;
    return (
      <button
        key={id}
        type="button"
        data-tab={id}
        className={selected ? "nav-item selected" : "nav-item"}
        aria-current={selected ? "page" : undefined}
        tabIndex={selected ? 0 : -1}
        onClick={() => go(id)}
      >
        <Icon name={icon} variant={selected ? "filled" : "regular"} />
        <span className="ellipsis">{label}</span>
      </button>
    );
  };

  return (
    <div className={settled ? "shell" : "shell settling"}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="apps" variant="filled" />
          </span>
          <span className="brand-text">
            <span className="body-strong">{ru.app.name}</span>
            <span className="brand-version">{ru.app.version}</span>
          </span>
        </div>

        <nav ref={navRef} className="sidebar-nav" aria-label={extra.shell.navLabel} onKeyDown={onNavKey}>
          {TABS.map((t) => navButton(t.id, t.icon, ru.settings.nav[t.id]))}
          <div className="sidebar-spacer" />
          <div className="sidebar-foot">
            {navButton("welcome", "book_open", extra.shell.help)}
            <LanguageSwitch />
          </div>
        </nav>
      </aside>

      <main ref={contentRef} className={animate ? "content anim" : "content"}>
        <NavigateContext.Provider value={go}>
          {loaded && <Fragment key={route.tab}>{renderPage(route)}</Fragment>}
        </NavigateContext.Provider>
      </main>
    </div>
  );
}
