// «О программе»: brand, authors, credits, privacy, licences.
import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Page, Section } from "../components/Section";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.shell";
import licence from "../map/LICENSE.md?raw";
import { IconRow } from "./shell/IconRow";

const ab = ru.settings.about;
const x = extra.about;

const open = (url: string) => void openUrl(url).catch(() => undefined);

export function AboutPage() {
  const [licenceOpen, setLicenceOpen] = useState(false);

  return (
    <Page title={ru.settings.nav.about}>
      <header className="about-hero">
        <span className="about-mark" aria-hidden="true">
          <Icon name="apps" variant="filled" />
        </span>
        <div className="about-text">
          <div className="about-name">{ru.app.name}</div>
          <div className="about-meta">
            <span className="badge">
              {ab.versionLabel} {ru.app.version}
            </span>
            <span className="badge neutral">
              <Icon name="code" size={16} />
              {x.openSource}
            </span>
          </div>
          <div className="about-tagline">{ru.app.tagline}</div>
        </div>
      </header>

      <Section title={ab.authors}>
        <div className="author">
          <span className="avatar" aria-hidden="true">
            {ab.author1.charAt(0).toUpperCase()}
          </span>
          <div className="author-text">
            <span className="body-strong ellipsis">{ab.author1}</span>
            <span className="row-hint ellipsis">{ab.author1Role}</span>
          </div>
          <div className="author-links">
            <Button icon="code" onClick={() => open(ab.author1Github)}>
              {ab.github}
            </Button>
            <Button icon="chat" onClick={() => open(ab.telegramUrl)}>
              {ab.telegram}
            </Button>
          </div>
        </div>
        <div className="callout">
          <Icon name="lightbulb" variant="filled" />
          <span className="callout-text">{ab.feedback}</span>
          <button type="button" className="link-btn" onClick={() => open(ab.telegramUrl)}>
            @{ab.author1Telegram}
          </button>
        </div>
      </Section>

      <Section title={ab.credits}>
        <IconRow icon="map" label={ab.mapCredit} tone="neutral">
          <Button size="sm" variant="subtle" icon="open" onClick={() => open(ab.mapRepo)}>
            {x.mapRepoLabel}
          </Button>
        </IconRow>
        <IconRow icon="color" label={ab.iconsCredit} tone="neutral" />
        <IconRow icon="text_font" label={ab.fontsCredit} tone="neutral" />
        <IconRow icon="code" label={ab.stackCredit} tone="neutral" />
      </Section>

      <Section title={ab.privacy}>
        <IconRow icon="lock_closed" label={ab.privacyText} />
      </Section>

      <Section title={ab.license} padded>
        <p className="about-p">{ab.licenseText}</p>
        <div className="inline between">
          <span className="row-label">{x.mapLicence}</span>
          <Button size="sm" aria-expanded={licenceOpen} onClick={() => setLicenceOpen((v) => !v)}>
            {licenceOpen ? x.hide : x.show}
          </Button>
        </div>
        {licenceOpen && <pre className="licence-box">{licence}</pre>}
      </Section>
    </Page>
  );
}
