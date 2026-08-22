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
  onOpenCommandPalette,
  preloadState,
  knownPanels,
  openPanelIds,
  onTogglePanel,
}) {
  return (
    <div
      className="titlebar"
      onDoubleClick={() => window.disc?.windowToggleMaximize()}
    >
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
        <WindowControls />
      </div>
    </div>
  );
}
