import { isDarkColor } from "./colorMath.js";

// Every CSS variable a built-in theme sets in themes.css — a custom theme
// needs to set (or clear) the same list so switching back to a built-in
// theme doesn't leave stray inline overrides behind. The "-base" trio are
// a stable, gradient-immune record of the flat colors, used by
// applyAppearanceSettings as its source of truth for deriving a gradient
// — custom themes have no CSS-rule fallback to recover a flat color from
// once it's been overwritten with a gradient string, so this is the only
// reliable place to read the "real" color back from.
const CUSTOM_THEME_VARS = [
  "--bg-app",
  "--bg-panel",
  "--bg-panel-alt",
  "--bg-app-base",
  "--bg-panel-base",
  "--bg-panel-alt-base",
  "--bg-hover",
  "--bg-active",
  "--border-color",
  "--text-primary",
  "--text-secondary",
  "--text-tertiary",
  "--accent",
  "--accent-hover",
  "--accent-text",
  "--waveform",
  "--waveform-progress",
];

// Derives a full theme from just the 4 colors someone actually picks, using
// color-mix() so the derived shades stay correct even though we don't know
// the exact palette in advance — direction (lighten vs darken) is chosen
// based on whether the background is dark or light.
export function applyCustomThemeVars(base) {
  const { bgApp, bgPanel, accent, textPrimary } = base;
  const dark = isDarkColor(bgApp);
  const towardsSurface = dark ? "white" : "black";
  const towardsBorder = dark ? "white" : "black";
  const root = document.documentElement.style;

  root.setProperty("--bg-app", bgApp);
  root.setProperty("--bg-panel", bgPanel);
  root.setProperty(
    "--bg-panel-alt",
    `color-mix(in srgb, ${bgPanel} 90%, ${towardsSurface})`
  );
  // Stable copies (see comment on CUSTOM_THEME_VARS above) — always set
  // fresh here, so appearance settings always have an unpolluted flat
  // color to derive a gradient from, no matter how many times gradient
  // mode has already rewritten the vars above.
  root.setProperty("--bg-app-base", bgApp);
  root.setProperty("--bg-panel-base", bgPanel);
  root.setProperty(
    "--bg-panel-alt-base",
    `color-mix(in srgb, ${bgPanel} 90%, ${towardsSurface})`
  );
  root.setProperty(
    "--bg-hover",
    `color-mix(in srgb, ${bgPanel} 80%, ${towardsSurface})`
  );
  root.setProperty(
    "--bg-active",
    `color-mix(in srgb, ${bgPanel} 70%, ${towardsSurface})`
  );
  root.setProperty(
    "--border-color",
    `color-mix(in srgb, ${bgPanel} 60%, ${towardsBorder})`
  );
  root.setProperty("--text-primary", textPrimary);
  root.setProperty(
    "--text-secondary",
    `color-mix(in srgb, ${textPrimary} 70%, ${bgApp})`
  );
  root.setProperty(
    "--text-tertiary",
    `color-mix(in srgb, ${textPrimary} 45%, ${bgApp})`
  );
  root.setProperty("--accent", accent);
  root.setProperty("--accent-hover", `color-mix(in srgb, ${accent} 85%, white)`);
  root.setProperty("--accent-text", isDarkColor(accent) ? "#ffffff" : "#0d1117");
  root.setProperty(
    "--waveform",
    `color-mix(in srgb, ${bgPanel} 50%, ${textPrimary})`
  );
  root.setProperty("--waveform-progress", accent);
}

export function clearCustomThemeVars() {
  const root = document.documentElement.style;
  CUSTOM_THEME_VARS.forEach((name) => root.removeProperty(name));
}
