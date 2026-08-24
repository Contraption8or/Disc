// Each theme just points at a data-theme value; the actual colors live in
// themes.css as CSS custom properties. Adding a new built-in theme means
// adding one entry here and one block in themes.css.
//
// requiresAcrylic themes are different from the rest: their panels are
// translucent CSS on purpose, meant to be seen over real Windows 11 Mica
// behind the window (see requiresAcrylic handling in ThemeSwitcher.jsx and
// the backgroundMaterial setup in electron/main.js), not just flat colors.
// On anything other than Windows 11 this still applies — translucent
// panels over a plain dark window, no real blur — rather than being
// hidden outright, same graceful-degrade spirit as the rest of the app.
export const THEMES = [
  { id: "premiere-dark", label: "Premiere Dark", swatch: "#1b1b1f" },
  { id: "hianime", label: "HiAnime", swatch: "#8b5cf6" },
  { id: "sunset", label: "Sunset", swatch: "#F64668", requiresAcrylic: true },
  { id: "tron", label: "Tron", swatch: "#ff4d5e", requiresAcrylic: true },
  { id: "emerald", label: "Emerald", swatch: "#34d399", requiresAcrylic: true },
  { id: "abyss", label: "Abyss", swatch: "#22d3ee", requiresAcrylic: true },
  { id: "ember", label: "Ember", swatch: "#f0a04b", requiresAcrylic: true },
  { id: "midnight", label: "Midnight", swatch: "#6366f1", requiresAcrylic: true },
  { id: "blush", label: "Blush", swatch: "#ec4899", requiresAcrylic: true },
  { id: "paper", label: "Paper", swatch: "#f3efe7" },
];

export const DEFAULT_THEME = "premiere-dark";
