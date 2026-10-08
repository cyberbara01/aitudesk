// «О программе»: app header, help, the author and the feedback form, credits, privacy, licences. Below the
// header everything is kit sections with one alignment rule: label and hint on the left edge of the card,
// actions on the right. The feedback row says up front that the form is anonymous and a rating alone will do.
// The only marks are the ones that are links: GitHub (the author, the map's author, the map's repository),
// Telegram and Google (the feedback form is a Google Form).
import { useId, useState, type MouseEvent, type ReactNode } from "react";
import { appDataDir, join } from "@tauri-apps/api/path";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { Page, Row, Section } from "../components/Section";
import { Tooltip } from "../components/Tooltip";
import { ru } from "../i18n/ru";
import { extra } from "../i18n/ru.extra.shell";
import appLicence from "../../LICENSE?raw";
import mapLicence from "../map/LICENSE.md?raw";
import iconsLicence from "../icons/LICENSE-FluentIcons.txt?raw";
import { useNavigate } from "./shell/nav";

const ab = ru.settings.about;
const x = extra.about;

const open = (url: string) => void openUrl(url).catch(() => undefined);

/** Explorer on the folder with the settings file, the file selected: everything the app keeps is there. */
const openDataFolder = () =>
  void appDataDir()
    .then((dir) => join(dir, "settings.json"))
    .then((file) => revealItemInDir(file))
    .catch(() => undefined);

/** Licence files are hard-wrapped at 80 columns; reflowed into paragraphs they wrap cleanly at any width. */
const paragraphs = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " "));

const appLicenceParagraphs = paragraphs(appLicence);
const mapLicenceParagraphs = paragraphs(mapLicence);
const iconsLicenceParagraphs = paragraphs(iconsLicence);

/** GitHub's mark (Primer Octicons «mark-github»). */
function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** Telegram's mark: the paper plane in a circle. */
function TelegramMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

/** Google's «G», in one colour like the other marks: the feedback form is a Google Form. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );
}

/** A mark in the icon slot of a kit button (where a Fluent icon would be). */
function ButtonMark({ children }: { children: ReactNode }) {
  return (
    <span className="icon btn-mark" aria-hidden="true">
      {children}
    </span>
  );
}

/** A link shaped like the kit's icon button: the mark inside, its name for assistive tech and in a tooltip. */
function MarkLink({ href, name, children }: { href: string; name: string; children: ReactNode }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    open(href);
  };
  return (
    <Tooltip text={name} className="mark-anchor">
      <a
        className="icon-btn mark-link"
        href={href}
        aria-label={name}
        draggable={false}
        onClick={onClick}
        onAuxClick={(e) => e.preventDefault()}
      >
        <span className="icon">{children}</span>
      </a>
    </Tooltip>
  );
}

/** A licence's name with «Показать» / «Скрыть», and its full text under them. */
function LicenceText({ label, text }: { label: string; text: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <div className="inline between">
        <span className="row-label">{label}</span>
        <Button aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
          {open ? x.hide : x.show}
        </Button>
      </div>
      <div id={id} className="licence-box" hidden={!open}>
        {text.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </>
  );
}

export function AboutPage() {
  const navigate = useNavigate();

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
            <span>{ab.licenseName}</span>
          </div>
        </div>
      </header>

      <Section>
        <Row label={extra.shell.help} hint={x.helpHint}>
          <Button icon="book_open" onClick={() => navigate("welcome")}>
            {x.guide}
          </Button>
        </Row>
        <Row label={ab.author}>
          <span className="about-links">
            <MarkLink href={ab.author1Github} name={`${ab.github}: ${ab.author1}`}>
              <GitHubMark />
            </MarkLink>
            <MarkLink href={ab.telegramUrl} name={`${ab.telegram}: @${ab.author1Telegram}`}>
              <TelegramMark />
            </MarkLink>
          </span>
        </Row>
        <Row label={x.feedback} hint={x.feedbackHint}>
          <Button onClick={() => open(ab.feedbackUrl)}>
            <ButtonMark>
              <GoogleMark />
            </ButtonMark>
            {x.feedbackButton}
          </Button>
        </Row>
      </Section>

      <Section title={ab.credits}>
        <Row label={x.mapTitle} hint={ab.mapCredit}>
          <span className="inline about-credit-links">
            <Tooltip text={`${ab.github}: ${ab.mapAuthor}`}>
              <Button onClick={() => open(ab.mapAuthorGithub)}>
                <ButtonMark>
                  <GitHubMark />
                </ButtonMark>
                {ab.author}
              </Button>
            </Tooltip>
            <Button onClick={() => open(ab.mapRepo)}>
              <ButtonMark>
                <GitHubMark />
              </ButtonMark>
              {x.mapRepoLabel}
            </Button>
          </span>
        </Row>
        <Row label={ab.iconsTitle} hint={ab.iconsCredit} />
        <Row label={ab.fontsTitle} hint={ab.fontsCredit} />
        <Row label={ab.stackTitle} hint={ab.stackCredit} />
      </Section>

      <Section title={ab.privacy} padded>
        <p className="about-p">{ab.privacyText}</p>
        <div className="inline between">
          <span className="row-text">
            <span className="row-label">{x.dataFolder}</span>
            <span className="row-hint">{x.dataFolderHint}</span>
          </span>
          <Button icon="folder_open" onClick={openDataFolder}>
            {x.openFolder}
          </Button>
        </div>
      </Section>

      <Section title={ab.license} padded>
        <p className="about-p">{x.appLicenceText}</p>
        <LicenceText label={x.appLicence} text={appLicenceParagraphs} />
        <LicenceText label={x.mapLicence} text={mapLicenceParagraphs} />
        <LicenceText label={x.iconsLicence} text={iconsLicenceParagraphs} />
      </Section>
    </Page>
  );
}
