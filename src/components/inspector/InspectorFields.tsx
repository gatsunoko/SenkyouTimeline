import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";

export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const skipCommitRef = useRef(false);
  const textInputRef = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [editing, value]);

  const commitValue = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max ?? parsed, Math.max(min ?? parsed, parsed));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  const commit = () => {
    commitValue(draft);
  };

  return (
    <label>
      {label}
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onFocus={() => setEditing(true)}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          if (!textInputRef.current) commitValue(nextDraft);
          textInputRef.current = false;
        }}
        onBlur={() => {
          if (skipCommitRef.current) {
            skipCommitRef.current = false;
            setDraft(String(value));
          } else {
            commit();
          }
          setEditing(false);
        }}
        onKeyDown={(event) => {
          const editsText =
            event.key.length === 1 ||
            event.key === "Backspace" ||
            event.key === "Delete" ||
            event.key === "Cut" ||
            event.key === "Paste";
          textInputRef.current = editsText;
          if (event.key === "ArrowUp" || event.key === "ArrowDown") textInputRef.current = false;
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            skipCommitRef.current = true;
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

export function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (value: T) => void }) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as T)}>
        {Object.entries(options).map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={optionValue}>
            {optionLabel as ReactNode}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="check-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
