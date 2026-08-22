// Each theme just points at a data-theme value; the actual colors live in
// themes.css as CSS custom properties. Adding a new built-in theme means
// adding one entry here and one block in themes.css.
export const THEMES = [
  { id: "premiere-dark", label: "Premiere Dark", swatch: "#1b1b1f" },
  { id: "hianime", label: "HiAnime", swatch: "#8b5cf6" },
  { id: "sunset", label: "Sunset", swatch: "#F64668" },
  { id: "emerald", label: "Emerald", swatch: "#34d399" },
  { id: "abyss", label: "Abyss", swatch: "#22d3ee" },
  { id: "ember", label: "Ember", swatch: "#f0a04b" },
  { id: "midnight", label: "Midnight", swatch: "#6366f1" },
  { id: "blush", label: "Blush", swatch: "#ec4899" },
  { id: "paper", label: "Paper", swatch: "#f3efe7" },
  { id: "mist", label: "Mist", swatch: "#eef1f6" },
];

export const DEFAULT_THEME = "premiere-dark";
