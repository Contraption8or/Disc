import { useEffect, useState } from "react";
import { applyCustomThemeVars } from "../themes/customThemeEngine.js";
import { useColorInputGuard } from "../hooks/useColorInputGuard.js";
import "./ThemeCreatorModal.css";

const DEFAULT_BASE = {
  bgApp: "#1b1b1f",
  bgPanel: "#232327",
  accent: "#4f9dff",
  textPrimary: "#e8e8ea",
};

export default function ThemeCreatorModal({ onSave, onCancel, initialName, initialBase }) {
  const isEditing = Boolean(initialBase);
  const [name, setName] = useState(initialName || "My Theme");
  const [base, setBase] = useState(initialBase || DEFAULT_BASE);
  const { activeRef: colorInputActiveRef, colorInputProps } = useColorInputGuard();

  useEffect(() => {
    applyCustomThemeVars(base);
    // Only ever needs to run once, when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField(field, value) {
    const next = { ...base, [field]: value };
    setBase(next);
    // Live preview — actually applies while the modal's open.
    applyCustomThemeVars(next);
  }

  // Any of the four color inputs' native picker (including its eyedropper,
  // which can sample a color from outside the window entirely) causes
  // focus/blur behavior that a plain "click landed outside the modal"
  // check can't tell apart from an actual dismiss-click — so skip closing
  // while a color input is in active use.
  function handleBackdropClick() {
    if (colorInputActiveRef.current) return;
    onCancel();
  }

  return (
    <div className="theme-creator__backdrop" onClick={handleBackdropClick}>
      <div className="theme-creator" onClick={(e) => e.stopPropagation()}>
        <div className="theme-creator__title">
          {isEditing ? "Edit theme" : "Create a theme"}
        </div>

        <label className="theme-creator__name-label">
          Name
          <input
            className="theme-creator__name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Theme"
          />
        </label>

        <div className="theme-creator__fields">
          <ColorField
            label="Background"
            value={base.bgApp}
            onChange={(v) => updateField("bgApp", v)}
            colorInputProps={colorInputProps}
          />
          <ColorField
            label="Panels"
            value={base.bgPanel}
            onChange={(v) => updateField("bgPanel", v)}
            colorInputProps={colorInputProps}
          />
          <ColorField
            label="Accent"
            value={base.accent}
            onChange={(v) => updateField("accent", v)}
            colorInputProps={colorInputProps}
          />
          <ColorField
            label="Text"
            value={base.textPrimary}
            onChange={(v) => updateField("textPrimary", v)}
            colorInputProps={colorInputProps}
          />
        </div>

        <p className="theme-creator__hint">
          Everything else — hover states, borders, secondary text — is
          derived automatically from these four.
        </p>

        <div className="theme-creator__actions">
          <button className="theme-creator__cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="theme-creator__save"
            onClick={() => onSave(name.trim() || "My Theme", base)}
          >
            {isEditing ? "Save Changes" : "Save Theme"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange, colorInputProps }) {
  return (
    <label className="theme-creator__field">
      <input
        type="color"
        className="theme-creator__swatch"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...colorInputProps}
      />
      <span className="theme-creator__field-label">{label}</span>
    </label>
  );
}
