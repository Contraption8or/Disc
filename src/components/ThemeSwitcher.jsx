import { useEffect, useRef, useState } from "react";
import { THEMES } from "../themes/themes.js";
import { loadCustomThemes, saveCustomThemes } from "../themes/customThemes.js";
import ThemeCreatorModal from "./ThemeCreatorModal.jsx";
import ThemeContextMenu from "./ThemeContextMenu.jsx";
import "./ThemeSwitcher.css";

export default function ThemeSwitcher({ theme, onChange, onPreviewCancel }) {
  const [open, setOpen] = useState(false);
  const [modalTarget, setModalTarget] = useState(null); // null | "new" | customTheme
  const [themeContextMenu, setThemeContextMenu] = useState(null); // { x, y, theme } | null
  const [customThemes, setCustomThemes] = useState(loadCustomThemes);
  const rootRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const allThemes = [
    ...THEMES,
    ...customThemes.map((t) => ({ id: t.id, label: t.name, swatch: t.base.accent })),
  ];
  const active = allThemes.find((t) => t.id === theme) ?? THEMES[0];

  function handleSaveTheme(name, base) {
    if (modalTarget && modalTarget !== "new") {
      // Editing an existing custom theme.
      const editingId = modalTarget.id;
      const next = customThemes.map((t) =>
        t.id === editingId ? { ...t, name, base } : t
      );
      setCustomThemes(next);
      saveCustomThemes(next);
      onChange(editingId);
    } else {
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next = [...customThemes, { id, name, base }];
      setCustomThemes(next);
      saveCustomThemes(next);
      onChange(id);
    }
    setModalTarget(null);
  }

  function handleDeleteTheme(id, e) {
    e?.stopPropagation();
    const next = customThemes.filter((t) => t.id !== id);
    setCustomThemes(next);
    saveCustomThemes(next);
    if (theme === id) onChange(THEMES[0].id);
  }

  function handleThemeContextMenu(e, t) {
    e.preventDefault();
    e.stopPropagation();
    setThemeContextMenu({ x: e.clientX, y: e.clientY, theme: t });
  }

  return (
    <div className="theme-switcher" ref={rootRef}>
      <button
        className="theme-switcher__trigger"
        onClick={() => setOpen((o) => !o)}
        title="Change theme"
      >
        <span
          className="theme-switcher__swatch"
          style={{ background: active.swatch, color: active.swatch }}
        />
        <span>{active.label}</span>
      </button>

      {open && (
        <div className="theme-switcher__menu">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={
                "theme-switcher__option" +
                (t.id === theme ? " theme-switcher__option--active" : "")
              }
              onClick={() => {
                onChange(t.id);
                setOpen(false);
              }}
            >
              <span
                className="theme-switcher__swatch"
                style={{ background: t.swatch, color: t.swatch }}
              />
              {t.label}
            </button>
          ))}

          {customThemes.length > 0 && <div className="theme-switcher__divider" />}

          {customThemes.map((t) => (
            <div
              key={t.id}
              className="theme-switcher__row"
              title="Right-click to edit"
              onContextMenu={(e) => handleThemeContextMenu(e, t)}
            >
              <button
                className={
                  "theme-switcher__option" +
                  (t.id === theme ? " theme-switcher__option--active" : "")
                }
                onClick={() => {
                  onChange(t.id);
                  setOpen(false);
                }}
              >
                <span
                  className="theme-switcher__swatch"
                  style={{ background: t.base.accent, color: t.base.accent }}
                />
                {t.name}
              </button>
              <button
                className="theme-switcher__delete"
                title={`Delete "${t.name}"`}
                onClick={(e) => handleDeleteTheme(t.id, e)}
              >
                ×
              </button>
            </div>
          ))}

          <div className="theme-switcher__divider" />
          <button
            className="theme-switcher__option theme-switcher__option--accent"
            onClick={() => {
              setModalTarget("new");
              setOpen(false);
            }}
          >
            + Create custom theme
          </button>
        </div>
      )}

      {modalTarget && (
        <ThemeCreatorModal
          initialName={modalTarget !== "new" ? modalTarget.name : undefined}
          initialBase={modalTarget !== "new" ? modalTarget.base : undefined}
          onSave={handleSaveTheme}
          onCancel={() => {
            setModalTarget(null);
            onPreviewCancel();
          }}
        />
      )}

      {themeContextMenu && (
        <ThemeContextMenu
          x={themeContextMenu.x}
          y={themeContextMenu.y}
          onEdit={() => setModalTarget(themeContextMenu.theme)}
          onDelete={() => handleDeleteTheme(themeContextMenu.theme.id)}
          onClose={() => setThemeContextMenu(null)}
        />
      )}
    </div>
  );
}
