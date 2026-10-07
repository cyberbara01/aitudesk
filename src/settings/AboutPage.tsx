// «О программе»: app header, author, credits, privacy, licences. Below the header everything is kit sections
// with one alignment rule: label and hint on the left edge of the card, actions on the right, no icons.
import { useId, useState } from "react";
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

/** The licence file is hard-wrapped at 80 columns; reflowed into paragraphs it wraps cleanly at any width. */
const licenceParagraphs = licence
  .replace(/\r\n?/g, "\n")
  .trim()
  .split(/\n\s*\n/)
  .map((p) => p.replace(/\s*\n\s*/g, " "));

export function AboutPage() {
  const [licenceOpen, setLicenceOpen] = useState(false);
  const licenceId = useId();

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
            <span>{x.licenseName}</span>
          </div>
        </div>
      </header>

      <Section title={ab.authors}>
        <Row label={ab.author1} hint={ab.author1Role}>
          <Button onClick={() => open(ab.author1Github)}>{ab.github}</Button>
          <Button onClick={() => open(ab.telegramUrl)}>{ab.telegram}</Button>
        </Row>
        <Row label={ab.feedback} hint={ab.feedbackHint}>
          <Button variant="accent" onClick={() => open(ab.telegramUrl)}>
            @{ab.author1Telegram}
          </Button>
        </Row>
      </Section>

      <Section title={ab.credits}>
        <Row label={ab.mapTitle} hint={ab.mapCredit}>
          <Button onClick={() => open(ab.mapRepo)}>{x.mapRepoLabel}</Button>
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
          <Button aria-expanded={licenceOpen} aria-controls={licenceId} onClick={() => setLicenceOpen((v) => !v)}>
            {licenceOpen ? x.hide : x.show}
          </Button>
        </div>
        <div id={licenceId} className="licence-box" hidden={!licenceOpen}>
          {licenceParagraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </Section>
    </Page>
  );
}
