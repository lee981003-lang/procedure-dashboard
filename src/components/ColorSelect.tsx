import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RoomTagSwatch } from "../roomTagPalette";

type ColorSelectProps = {
  label: string;
  value: string | null;
  options: RoomTagSwatch[];
  defaultColor: string;
  previewTextColor?: string;
  disabled?: boolean;
  onChange: (value: string | null) => void;
};

export function ColorSelect({
  label,
  value,
  options,
  defaultColor,
  previewTextColor = "#1f2937",
  disabled = false,
  onChange,
}: ColorSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const swatchColor = selected?.value ?? defaultColor;

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const choose = (nextValue: string | null) => {
    onChange(nextValue);
    setOpen(false);
  };

  return (
    <div className="color-select" ref={rootRef}>
      <span className="color-select__label">{label}</span>
      <button
        type="button"
        className="color-select__trigger"
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className="color-select__swatch"
          style={{ background: swatchColor, color: previewTextColor }}
          aria-hidden="true"
        >
          가
        </span>
        <span className="color-select__value">{selected?.label ?? "기본색"}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className="color-select__menu" role="listbox" aria-label={label}>
          <button
            type="button"
            className={`color-select__option${value === null ? " color-select__option--active" : ""}`}
            onClick={() => choose(null)}
            role="option"
            aria-selected={value === null}
          >
            <span
              className="color-select__swatch"
              style={{ background: defaultColor, color: previewTextColor }}
              aria-hidden="true"
            >
              가
            </span>
            기본색
          </button>
          {options.map((option) => (
            <button
              type="button"
              className={`color-select__option${value === option.value ? " color-select__option--active" : ""}`}
              key={option.value}
              onClick={() => choose(option.value)}
              role="option"
              aria-selected={value === option.value}
            >
              <span
                className="color-select__swatch"
                style={{ background: option.value, color: previewTextColor }}
                aria-hidden="true"
              >
                가
              </span>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
