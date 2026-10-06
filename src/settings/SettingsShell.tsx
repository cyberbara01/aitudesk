// Settings window (label "settings"): sidebar with brand + navigation, scrolling content with one page.
// Initial tab from ?tab=&edit=, later from the "settings-navigate" event; arrow keys move within the sidebar.
import { Fragment, useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.shell";
import { useSettingsLoaded } from "../lib/useSettings";
import { AboutPage } from "./AboutPage";
import { AppearancePage } from "./AppearancePage";
import { ClockPage } from "./ClockPage";
import { GeneralPage } from "./GeneralPage";
import { LaunchersPage } from "./LaunchersPage";
import { MapPage } from "./MapPage";
import { SchedulePage } from "./SchedulePage";
import { NotesPage } from "./NotesPage";
import { SystemPage } from "./SystemPage";
import { TABS, acceptsEdit, readInitialRoute, type Route, type TabId } from "./shell/nav";
import { useNavigateEvent } from "./shell/useNavigateEvent";

function renderPage(route: Route) {
  switch (route.tab) {
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
      return <SchedulePage />;
    case "notes":
      return <NotesPage key={`notes-${route.nonce}`} editId={route.edit} />;
    case "about":
      return <AboutPage />;
  }
}

export function SettingsWindow() {
  const [route, setRoute] = useState<Route>(readInitialRoute);
  // Page fade only after the first user-driven switch (nothing animates at startup).
  const [animate, setAnimate] = useState(false);
  const loaded = useSettingsLoaded();
  const contentRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);

  const go = useCallback((tab: TabId, edit: string | null = null) => {
    setAnimate(true);
    setRoute((prev) => {
      const e = acceptsEdit(tab) ? edit : null;
      return { tab, edit: e, nonce: e ? prev.nonce + 1 : prev.nonce };
    });
  }, []);

  useNavigateEvent(go);

  useLayoutEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [route.tab]);

  const onNavKey = (e: KeyboardEvent<HTMLElement>) => {
    const i = TABS.findIndex((t) => t.id === route.tab);
    let next: number;
    if (e.key === "ArrowDown") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowUp") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    const id = TABS[next].id;
    go(id);
    navRef.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus();
  };

  return (
    <div className="shell">
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
          {TABS.map((t) => {
            const selected = t.id === route.tab;
            return (
              <button
                key={t.id}
                type="button"
                data-tab={t.id}
                className={selected ? "nav-item selected" : "nav-item"}
                aria-current={selected ? "page" : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => go(t.id)}
              >
                <Icon name={t.icon} variant={selected ? "filled" : "regular"} />
                <span className="ellipsis">{ru.settings.nav[t.id]}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
      </aside>

      <main ref={contentRef} className={animate ? "content anim" : "content"}>
        {loaded && <Fragment key={route.tab}>{renderPage(route)}</Fragment>}
      </main>
    </div>
  );
}
