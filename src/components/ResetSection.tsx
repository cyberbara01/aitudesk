// «Сбросить настройки раздела»: a quiet button at the end of a settings page with a confirmation dialog.
// Resets only the look of that page (src/lib/settings.ts resetSection); user data stays.
import { useCallback, useState } from "react";
import { ru } from "../i18n/ru";
import { settings, type ResetSection as Section } from "../lib/settings";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export function ResetSection({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const confirm = () => {
    setOpen(false);
    void settings.resetSection(section);
  };
  return (
    <div className="reset-section">
      <Button variant="subtle" icon="arrow_reset" onClick={() => setOpen(true)}>
        {ru.common.resetSection}
      </Button>
      <Dialog
        open={open}
        title={ru.common.resetSectionTitle}
        onClose={close}
        width="440px"
        footer={
          <>
            <Button onClick={close}>{ru.common.cancel}</Button>
            <Button variant="accent" onClick={confirm}>
              {ru.common.reset}
            </Button>
          </>
        }
      >
        <p className="reset-text">{ru.common.resetSectionText}</p>
      </Dialog>
    </div>
  );
}
