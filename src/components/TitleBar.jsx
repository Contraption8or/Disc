import { useEffect } from "react";
import ThemeSwitcher from "./ThemeSwitcher.jsx";
import LayoutPresets from "./LayoutPresets.jsx";
import VolumeControl from "./VolumeControl.jsx";
import WindowControls from "./WindowControls.jsx";
import WindowsMenu from "./WindowsMenu.jsx";
import ProfilesMenu from "./ProfilesMenu.jsx";
import Icon from "./Icon.jsx";
import "./TitleBar.css";

export default function TitleBar({
  theme,
  onThemeChange,
  onThemePreviewCancel,
  pinned,
  onTogglePin,
  layoutPresetNames,
  onSaveLayout,
  onLoadLayout,
  onDeleteLayout,
  onRenameLayout,
  defaultLayoutName,
  onSetDefaultLayout,
  volume,
  onVolumeChange,
  onToggleCompactMode,
  onOpenShortcuts,
  onOpenSettings,
  onOpenHealth,
  onOpenConvert,
  onOpenTagManager,
  onOpenCommandPalette,
  preloadState,
  knownPanels,
  openPanelIds,
  onTogglePanel,
}) {
  // The window-snap system (see electron/main.js) needs to know exactly
  // when a title-bar drag actually ends, not just "no movement for a
  // while" — that's just a fallback there. A real OS-level window drag
  // (started by -webkit-app-region:drag) still delivers this window's own
  // mouseup once the button is released, since the window tracks the
  // cursor throughout, so a plain document-level listener catches it
  // reliably without needing to know whether a drag is even in progress —
  // main.js only acts on this if one actually was.
  useEffect(() => {
    function handleMouseUp() {
      window.disc?.notifyMouseUp();
    }
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);

  return (
    <div className="titlebar" onDoubleClick={() => window.disc?.windowToggleMaximize()}>
      <div className="titlebar__brand">
        <span className="titlebar__mark">◎</span>
        <span className="titlebar__name">Disc</span>
      </div>

      <div className="titlebar__actions">
        <WindowsMenu
          knownPanels={knownPanels}
          openPanelIds={openPanelIds}
          onTogglePanel={onTogglePanel}
        />
        <ProfilesMenu />
        <div className="titlebar__divider" />
        <button
          className="titlebar__icon-button"
          title="Command palette (Ctrl/Cmd+K)"
          onClick={onOpenCommandPalette}
        >
          <Icon name="command" size={14} />
        </button>
        <button
          className="titlebar__icon-button"
          title="Library Health"
          onClick={onOpenHealth}
        >
          <Icon name="stethoscope" size={15} />
        </button>
        <button
          className="titlebar__icon-button"
          title="Manage Tags"
          onClick={onOpenTagManager}
        >
          <Icon name="tag" size={15} />
        </button>
        <button
          className="titlebar__icon-button"
          title="Convert audio to .mp3"
          onClick={onOpenConvert}
        >
          <Icon name="convert" size={15} />
        </button>
        <button
          className="titlebar__icon-button"
          title={
            preloadState?.status === "running"
              ? `Preloading library — ${preloadState.completed}/${preloadState.total}`
              : "Settings"
          }
          onClick={onOpenSettings}
        >
          <Icon name="gear" size={15} />
          {preloadState?.status === "running" && (
            <span className="titlebar__preload-badge">
              {preloadState.total
                ? Math.round((preloadState.completed / preloadState.total) * 100)
                : 0}
              %
            </span>
          )}
        </button>
        <button
          className="titlebar__icon-button"
          title="Keyboard shortcuts"
          onClick={onOpenShortcuts}
        >
          <Icon name="keyboard" size={15} />
        </button>
        <button
          className="titlebar__icon-button"
          title="Compact mode"
          onClick={onToggleCompactMode}
        >
          <Icon name="compact" size={14} />
        </button>
        <button
          className={"titlebar__pin" + (pinned ? " titlebar__pin--active" : "")}
          onClick={onTogglePin}
          title={pinned ? "Unpin from top" : "Keep Disc on top of other windows"}
        >
          <Icon name={pinned ? "lockClosed" : "lockOpen"} size={13} style={{ marginRight: 5 }} />
          {pinned ? "Pinned" : "Pin on top"}
        </button>
        <div className="titlebar__divider" />
        <VolumeControl volume={volume} onChange={onVolumeChange} />
        <LayoutPresets
          presetNames={layoutPresetNames}
          onSave={onSaveLayout}
          onLoad={onLoadLayout}
          onDelete={onDeleteLayout}
          onRenameLayout={onRenameLayout}
          defaultLayoutName={defaultLayoutName}
          onSetDefault={onSetDefaultLayout}
        />
        <ThemeSwitcher
          theme={theme}
          onChange={onThemeChange}
          onPreviewCancel={onThemePreviewCancel}
        />
        <div className="titlebar__divider" />
        <WindowControls />
      </div>
    </div>
  );
}
