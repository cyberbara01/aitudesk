// Actions right in the list widgets (schedule, notes): a pencil that pops up on the row under the pointer and opens
// that item's editor in the settings window, and a «+» row at the end of the list that adds a new item there. Both
// are plain buttons, so a press on them never starts dragging a row (useDragReorder leaves buttons alone).
import { Icon } from "./Icon";
import { Tooltip } from "./Tooltip";

/**
 * The pencil of one row: drawn over the row's right end (left of the privacy eye), seen while the row is hovered
 * (base.css .row-edit), so the text keeps its full width at rest. Render it inside a `.reveal-row`.
 */
export function EditButton({ label, onEdit }: { label: string; onEdit: () => void }) {
  return (
    <Tooltip text={label} className="row-edit">
      <button
        type="button"
        className="row-edit-btn"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        <Icon name="edit" size={16} />
      </button>
    </Tooltip>
  );
}

/** «+ Добавить …» after the last item of a list (base.css .list-add); `item` wraps it as one of the list's items. */
export function AddRow({ label, onAdd, item }: { label: string; onAdd: () => void; item?: boolean }) {
  const button = (
    <button type="button" className="list-add" onClick={onAdd}>
      <span className="list-add-icon" aria-hidden="true">
        <Icon name="add" size={16} />
      </span>
      <span className="list-add-text">{label}</span>
    </button>
  );
  return item ? (
    <div role="listitem" className="list-add-item">
      {button}
    </div>
  ) : (
    button
  );
}
