import React, { useEffect, useId, useRef, useState } from "react";

type Field = { id: string; label: string };

export function ColumnChooser({ fields, visible, onChange }: {
  fields: Field[];
  visible: string[];
  onChange: (columns: string[] | undefined) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState(visible);
  const matches = fields.filter(field => `${field.label} ${field.id}`.toLowerCase().includes(query.trim().toLowerCase()));

  function position() {
    if (!trigger.current || !panel.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(304, window.innerWidth - 24);
    const height = panel.current.offsetHeight || Math.min(420, window.innerHeight - 24);
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = rect.bottom + height + 6 <= window.innerHeight - 12
      ? rect.bottom + 6 : Math.max(12, rect.top - height - 6);
    panel.current.style.setProperty("--columns-left", `${left}px`);
    panel.current.style.setProperty("--columns-top", `${top}px`);
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  function close() {
    panel.current?.hidePopover();
    trigger.current?.focus();
  }

  return <>
    <button type="button" className="columns-trigger" ref={trigger}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
      onClick={() => {
        if (panel.current?.matches(":popover-open")) return close();
        setDraft(visible);
        setQuery("");
        position();
        panel.current?.showPopover();
        position();
        search.current?.focus();
      }}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" />
        <path d="M6 3v10M10 3v10" stroke="currentColor" />
      </svg>
      Columns <span className="columns-count">{visible.length}</span>
    </button>
    <div id={id} ref={panel} popover="auto" role="dialog" aria-labelledby={`${id}-title`}
      className="columns-popover" onToggle={() => setOpen(panel.current?.matches(":popover-open") ?? false)}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      }}>
      <div className="columns-heading">
        <strong id={`${id}-title`}>Display columns</strong>
        <div className="columns-description">{draft.length} of {fields.length} selected</div>
      </div>
      <div className="columns-search">
        <input ref={search} type="search" name="column-search" aria-label="Search columns"
          placeholder="Search columns..." value={query} onChange={event => setQuery(event.target.value)} />
      </div>
      <div className="columns-options" role="group" aria-label="Visible columns">
        {matches.length ? matches.map(field => <label key={field.id} className="columns-option" htmlFor={`${id}-${field.id}`}>
          <input type="checkbox" id={`${id}-${field.id}`} name="visible-columns" value={field.id}
            checked={draft.includes(field.id)} disabled={draft.length === 1 && draft.includes(field.id)}
            onChange={event => {
              const checked = event.target.checked;
              setDraft(current => checked ? [...current, field.id] : current.filter(value => value !== field.id));
            }} />
          <span>{field.label}</span>
        </label>) : <p className="columns-empty">No matching columns.</p>}
      </div>
      <div className="columns-footer">
        <button type="button" className="columns-reset" onClick={() => { onChange(undefined); close(); }}>Reset</button>
        <button type="button" className="columns-apply" disabled={!draft.length}
          onClick={() => { onChange(draft); close(); }}>Apply</button>
      </div>
    </div>
  </>;
}
