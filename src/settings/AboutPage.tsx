// «О программе»: brand, author, credits, privacy, licences. Plain rows with one alignment rule:
// label and hint on the left, actions on the right, no decorative icons.
import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Page, Row, Section } from "../components/Section";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.shell";
import licence from "../map/LICENSE.md?raw";

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
          <div className="about-tagline">{ru.app.tagline}</div>
          <div className="about-meta">
            <span>
              {ab.versionLabel} {ru.app.version}
            </span>
            <span className="about-dot" aria-hidden="true" />
            <span>{ab.openSource}</span>
            <span className="about-dot" aria-hidden="true" />
            <span>MIT</span>
          </div>
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
            <Button onClick={() => open(ab.author1Github)}>{ab.github}</Button>
            <Button onClick={() => open(ab.telegramUrl)}>{ab.telegram}</Button>
          </div>
        </div>
        <Row label={ab.feedback} hint={ab.feedbackHint}>
          <Button variant="accent" onClick={() => open(ab.telegramUrl)}>
            @{ab.author1Telegram}
          </Button>
        </Row>
      </Section>

      <Section title={ab.credits}>
        <Row label={ab.mapTitle} hint={ab.mapCredit}>
          <Button size="sm" onClick={() => open(ab.mapRepo)}>
            {x.mapRepoLabel}
          </Button>
        </Row>
        <Row label={ab.iconsTitle} hint={ab.iconsCredit} />
        <Row label={ab.fontsTitle} hint={ab.fontsCredit} />
        <Row label={ab.stackTitle} hint={ab.stackCredit} />
      </Section>

      <Section title={ab.privacy} padded>
        <p className="about-p">{ab.privacyText}</p>
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
