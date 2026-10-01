import { useEffect, useState } from "react";

const DISMISSED_VERSION_KEY = "disc.updateDismissedVersion";

// Checks for a newer release once, shortly after Disc finishes starting up
// (not immediately — let the heavier startup work settle first), and shows
// a plain toast rather than a modal if one's found: this is a background
// "by the way" notice, not something that should block getting into the
// app. Declining ("Later") remembers that specific version so it doesn't
// nag again every single launch — Settings > Updates still has a manual
// "Check for Updates" button for whenever someone wants to revisit it, and
// this re-offers on its own the moment an even newer version ships.
export default function UpdateToast() {
  const [updateInfo, setUpdateInfo] = useState(null); // { latestVersion, downloadUrl, assetName } | null
  const [status, setStatus] = useState("idle"); // idle | downloading | error
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.disc) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await window.disc.checkForUpdates();
      if (cancelled || !result?.success || !result.hasUpdate) return;
      const dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY);
      if (result.latestVersion === dismissedVersion) return;
      setUpdateInfo(result);
    }, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!updateInfo || dismissed) return null;

  function handleLater() {
    localStorage.setItem(DISMISSED_VERSION_KEY, updateInfo.latestVersion);
    setDismissed(true);
  }

  async function handleUpdate() {
    if (!updateInfo.downloadUrl) {
      // No installer asset on that release — nothing this toast can do
      // beyond pointing at Settings, where the same check links out to
      // the release itself.
      setStatus("error");
      return;
    }
    setStatus("downloading");
    const result = await window.disc.downloadAndInstallUpdate(
      updateInfo.downloadUrl,
      updateInfo.assetName
    );
    // On success the main process launches the installer and quits Disc
    // almost immediately — there's normally nothing left to update here
    // either way, but failing open (showing the error state) covers the
    // case where it doesn't.
    if (!result?.success) setStatus("error");
  }

  return (
    <div className="undo-toast">
      {status === "error" ? (
        <span>Couldn't start the update — try Settings &gt; Updates instead.</span>
      ) : status === "downloading" ? (
        <span>Downloading v{updateInfo.latestVersion}…</span>
      ) : (
        <>
          <span>Disc v{updateInfo.latestVersion} is available</span>
          <button className="undo-toast__button--ghost" onClick={handleLater}>
            Later
          </button>
          <button className="undo-toast__button" onClick={handleUpdate}>
            Update
          </button>
        </>
      )}
    </div>
  );
}
