import { useEffect, useRef, useState } from 'react';
import { useModel } from '../store/useModel';

/**
 * Numeric input with a local text buffer so decimals/intermediate states type
 * cleanly. Syncs from the store only while unfocused (so external updates like
 * "copy across" or a quote fetch refresh the field without fighting typing).
 * `percent` shows/edits the value as a percentage (store keeps the fraction).
 */
export function NumberInput({
  value,
  onCommit,
  percent = false,
  width,
}: {
  value: number;
  onCommit: (n: number) => void;
  percent?: boolean;
  width?: number;
}) {
  const toDisplay = (v: number) => (percent ? v * 100 : v);
  const fmt = (v: number) => (Number.isFinite(v) ? String(Number(v.toFixed(6))) : '');
  const [buf, setBuf] = useState(fmt(toDisplay(value)));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setBuf(fmt(toDisplay(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, percent]);

  const commit = (s: string) => {
    if (s.trim() === '' || s.trim() === '-' || s.trim() === '.') return onCommit(0);
    const n = parseFloat(s);
    if (Number.isFinite(n)) onCommit(percent ? n / 100 : n);
  };

  return (
    <span className="num">
      <input
        inputMode="decimal"
        style={width ? { width } : undefined}
        value={buf}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setBuf(fmt(toDisplay(value)));
        }}
        onChange={(e) => {
          setBuf(e.target.value);
          commit(e.target.value);
        }}
      />
      {percent && <i>%</i>}
    </span>
  );
}

/**
 * Editable field label — the label-mapping affordance. Shows the canonical
 * label (or the user's alias) with `aka` help; click the pencil to rename it to
 * whatever the company's report calls the line item.
 */
export function FieldLabel({ fieldId, label, aka }: { fieldId: string; label: string; aka?: string }) {
  const alias = useModel((s) => s.labels[fieldId]);
  const setLabel = useModel((s) => s.setLabel);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(alias ?? '');

  if (editing) {
    return (
      <span className="field-label editing">
        <input
          autoFocus
          value={draft}
          placeholder={label}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { setLabel(fieldId, draft); setEditing(false); }
            if (e.key === 'Escape') setEditing(false);
          }}
        />
        <button className="mini" onClick={() => { setLabel(fieldId, draft); setEditing(false); }}>✓</button>
      </span>
    );
  }

  return (
    <span className="field-label">
      <span className="lbl" title={aka ? `Report may call this: ${aka}` : undefined}>
        {alias ?? label}
        {alias && <em> ({label})</em>}
      </span>
      <button
        className="rename"
        title="Rename to match your report"
        onClick={() => { setDraft(alias ?? ''); setEditing(true); }}
      >
        ✎
      </button>
      {aka && <span className="aka">{aka}</span>}
    </span>
  );
}
