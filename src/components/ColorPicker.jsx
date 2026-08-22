import { useEffect, useRef, useState } from "react";
import { useColorInputGuard } from "../hooks/useColorInputGuard.js";
import "./ColorPicker.css";

const PRESET_COLORS = [
  "#ff6b6b",
  "#ffa94d",
  "#ffd43b",
  "#94d82d",
  "#38d9a9",
  "#22b8cf",
  "#4dabf7",
  "#748ffc",
  "#e599f7",
  "#f783ac",
];

export default function ColorPicker({ x, y, color, onChange, onClose }) {
  const rootRef = useRef(null);
  const [customHex, setCustomHex] = useState(color || "#748ffc");
  const { activeRef: colorInputActiveRef, colorInputProps } = useColorInputGuard();

  useEffect(() => {
    function handleClickOutside(e) {
      if (colorInputActiveRef.current) return;
      if (rootRef.current && !rootRef.current.contains(e.target)) onClose();
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, colorInputActiveRef]);

  return (
    <div className="color-picker" style={{ left: x, top: y }} ref={rootRef}>
      <div className="color-picker__grid">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            className={
              "color-picker__swatch" +
              (c.toLowerCase() === (color || "").toLowerCase()
                ? " color-picker__swatch--active"
                : "")
            }
            style={{ background: c, color: c }}
            title={c}
            onClick={() => {
              onChange(c);
              onClose();
            }}
          />
        ))}
      </div>

      <div className="color-picker__custom">
        <input
          type="color"
          className="color-picker__native"
          value={customHex}
          onChange={(e) => setCustomHex(e.target.value)}
          {...colorInputProps}
        />
        <span className="color-picker__hex">{customHex}</span>
        <button
          className="color-picker__apply"
          onClick={() => {
            onChange(customHex);
            onClose();
          }}
        >
          Use
        </button>
      </div>
    </div>
  );
}
