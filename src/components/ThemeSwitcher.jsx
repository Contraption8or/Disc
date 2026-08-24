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
  const [acrylicRestartNeeded, setAcrylicRestartNeeded] = useState(false);
  const [acrylicSupported, setAcrylicSupported] = useState(true);
  const rootRef = useRef(null);

  // Real blur only exists on Windows 11 (see isWindows11 in
  // electron/main.js) — everywhere else these themes still render, just as
  // translucent panels with no actual blur behind them. Checked once since
  // it can't change without an OS upgrade.
  useEffect(() => {
    window.disc?.supportsAcrylic().then(setAcrylicSupported);
  }, []);

  // A handful of themes (Tron, Sunset, Emerald, Abyss, Ember, Midnight,
  // Blush — see requiresAcrylic in themes.js) use translucent panels over
  // a real transparent/frameless Windows window (see useAcrylic and
  // hasNativeTitleBar in electron/main.js) — a startup-time window
  // setting, so switching either into OR out of one persists the
  // preference right away but can't take effect until the window is
  // recreated. Both directions genuinely need a restart here, not just
  // "turning on": a window that's still transparent/frameless from an
  // acrylic theme, now painting a fully opaque non-acrylic theme's CSS on
  // top, is exactly what produced a corrupted-looking blank window rather
  // than just "no blur yet". isAcrylicWindowActive reflects what *this*
  // running window actually has, so switching between two themes that
  // both need (or both don't need) acrylic doesn't nag for a restart that
  // wouldn't change anything. Suppressed entirely when turning acrylic on
  // isn't even supported (Windows 10) — no restart could satisfy that one
  // anyway, so nagging for it would just be a dead end.
  useEffect(() => {
    const needsAcrylic = Boolean(THEMES.find((t) => t.id === theme)?.requiresAcrylic);
    window.disc?.setAcrylicEnabled(needsAcrylic);
    if (needsAcrylic && !acrylicSupported) {
      setAcrylicRestartNeeded(false);
      return;
    }
    window.disc
      ?.isAcrylicWindowActive()
      .then((active) => setAcrylicRestartNeeded(needsAcrylic !== active));
  }, [theme, acrylicSupported]);

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

      {acrylicRestartNeeded && (
        <div className="theme-switcher__restart-banner">
          <span>
            {THEMES.find((t) => t.id === theme)?.requiresAcrylic
              ? "Restart Disc for this theme's blur to activate"
              : "Restart Disc to fully apply this theme"}
          </span>
          <div className="theme-switcher__restart-actions">
            <button
              className="theme-switcher__restart-later"
              onClick={() => setAcrylicRestartNeeded(false)}
            >
              Later
            </button>
            <button
              className="theme-switcher__restart-now"
              onClick={() => window.disc?.relaunchApp()}
            >
              Restart Now
            </button>
          </div>
        </div>
      )}

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
