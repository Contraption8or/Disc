import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import "./Dropdown.css";

// A drop-in replacement for <select>/<option> that's actually themeable —
// native <select> lets you style the closed box, but the popup list of
// options is rendered by the OS/browser and mostly ignores CSS, which is
// why it shows up with a plain white background regardless of theme.
//
// options: [{ value, label }] — value can be any type (number, string,
// etc.); unlike a native select, it's passed through to onChange as-is,
// no string coercion.
export default function Dropdown({ value, onChange, options, className, disabled, title }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const selected = options.find((o) => String(o.value) === String(value));

  return (
    <div className={"dropdown" + (className ? ` ${className}` : "")} ref={rootRef}>
      <button
        type="button"
        className="dropdown__trigger"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="dropdown__trigger-label">{selected?.label ?? ""}</span>
        <span className="dropdown__caret">
          <Icon name="caretDown" size={11} />
        </span>
      </button>
      {open && (
        <div className="dropdown__menu">
          {options.map((opt) => (
            <button
              type="button"
              key={opt.value}
              className={
                "dropdown__option" +
                (String(opt.value) === String(value) ? " dropdown__option--active" : "")
              }
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
