import React from "react";

// Layout-related keys that, when corrupted or from an incompatible older
// version, are the most likely thing to crash startup — clearing just these
// (never tracks, tags, notes, folders, or settings) is a safe "get me back
// in" reset.
const LAYOUT_KEYS = ["disc.layoutPresets", "disc.defaultLayoutName"];

// Without this, any uncaught error while rendering unmounts the entire
// React tree — the window goes blank (in a translucent theme, just a dark
// pane of glass) with no message and no way to recover short of finding
// the data folder by hand. This shows what actually went wrong and offers
// a way back in.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Disc crashed while rendering:", error, info?.componentStack);
  }

  resetLayoutAndReload = () => {
    try {
      LAYOUT_KEYS.forEach((k) => localStorage.removeItem(k));
    } catch {
      // Storage unavailable — reloading is still worth trying.
    }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Hardcoded, opaque colors on purpose: this has to stay readable even
    // when the theme's own variables are the thing that's broken, or the
    // window is a transparent acrylic one.
    const styles = {
      wrap: {
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1b1b1f",
        color: "#e8e8ea",
        fontFamily: "Inter, 'Segoe UI', system-ui, sans-serif",
        padding: 24,
      },
      card: {
        maxWidth: 640,
        width: "100%",
        background: "#232327",
        border: "1px solid #3a3a40",
        borderRadius: 12,
        padding: 24,
        boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
      },
      title: { margin: "0 0 8px", fontSize: 18, fontWeight: 700 },
      body: { margin: "0 0 16px", fontSize: 13.5, lineHeight: 1.5, color: "#9a9aa2" },
      pre: {
        margin: "0 0 18px",
        padding: 12,
        maxHeight: 200,
        overflow: "auto",
        background: "#1b1b1f",
        border: "1px solid #3a3a40",
        borderRadius: 8,
        fontSize: 12,
        lineHeight: 1.45,
        color: "#ef8a8a",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        userSelect: "text",
      },
      row: { display: "flex", gap: 10, flexWrap: "wrap" },
      primary: {
        background: "#4f9dff",
        color: "#0d1117",
        border: "none",
        borderRadius: 8,
        padding: "9px 16px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      },
      secondary: {
        background: "transparent",
        color: "#e8e8ea",
        border: "1px solid #3a3a40",
        borderRadius: 8,
        padding: "9px 16px",
        fontSize: 13,
        cursor: "pointer",
      },
    };

    const detail = `${error?.name || "Error"}: ${error?.message || String(error)}`;

    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h1 style={styles.title}>Disc hit a problem</h1>
          <p style={styles.body}>
            Something went wrong while drawing the window. Your library, tags, notes, and
            folders are untouched. Reloading usually fixes it; if it keeps happening,
            resetting the panel layout is the next thing to try.
          </p>
          <pre style={styles.pre}>{detail}</pre>
          <div style={styles.row}>
            <button style={styles.primary} onClick={() => window.location.reload()}>
              Reload
            </button>
            <button style={styles.secondary} onClick={this.resetLayoutAndReload}>
              Reset panel layout &amp; reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
