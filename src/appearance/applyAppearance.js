const RADIUS_VARS = ["--radius-sm", "--radius-md", "--radius-lg", "--radius-full"];
const BG_VARS = [
  { render: "--bg-app", base: "--bg-app-base" },
  { render: "--bg-panel", base: "--bg-panel-base" },
  { render: "--bg-panel-alt", base: "--bg-panel-alt-base" },
];

export function applyAppearanceSettings(settings) {
  const root = document.documentElement;

  // Clean mode: zero out the shared corner-radius variables that every
  // component's CSS already reads from — no per-component changes needed.
  if (settings.cleanMode) {
    RADIUS_VARS.forEach((v) => root.style.setProperty(v, "0px"));
  } else {
    RADIUS_VARS.forEach((v) => root.style.removeProperty(v));
  }

  // Reduce motion: a single blanket rule in appearance.css reads this
  // attribute and disables transitions/animations app-wide.
  root.setAttribute("data-reduce-motion", settings.reduceMotion ? "on" : "off");

  // Spill: a curated set of accent-colored elements and color dots/
  // swatches (see appearance.css) read this intensity variable for their
  // glow strength.
  root.setAttribute("data-spill", settings.spillEnabled ? "on" : "off");
  root.style.setProperty("--spill-intensity", String(settings.spillIntensity ?? 0.5));

  // Gradient: always derive from the theme's stable "-base" flat color
  // (see customThemeEngine.js / applyThemeById) rather than from the
  // render variable itself — reading from the render var would compound
  // a gradient-of-a-gradient on every call, and for custom themes there's
  // no CSS-rule fallback to recover a flat color from once it's been
  // overwritten. The render variable is always explicitly written here
  // (even in the "flat" case), rather than just removed, since custom
  // themes have nothing to fall back to if it's simply cleared.
  const computed = getComputedStyle(root);
  const angle = settings.gradientMode === "manual" ? settings.gradientAngle ?? 180 : 180;
  const strength = Math.max(0, Math.min(1, settings.gradientIntensity ?? 0.5));
  BG_VARS.forEach(({ render, base }) => {
    const baseColor = computed.getPropertyValue(base).trim();
    if (!baseColor) return;
    if (settings.gradientEnabled) {
      const lightenPct = Math.round(strength * 30);
      const lightened = `color-mix(in srgb, ${baseColor} ${100 - lightenPct}%, white ${lightenPct}%)`;
      root.style.setProperty(
        render,
        `linear-gradient(${angle}deg, ${lightened} 0%, ${baseColor} 70%)`
      );
    } else {
      root.style.setProperty(render, baseColor);
    }
  });
}
