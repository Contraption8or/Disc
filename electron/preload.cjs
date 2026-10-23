const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Every capability the renderer can reach is listed here — there is no
// other path from page code to Node/OS APIs.
contextBridge.exposeInMainWorld("disc", {
  platform: process.platform,
  toggleAlwaysOnTop: (shouldPin) =>
    ipcRenderer.invoke("disc:toggle-always-on-top", shouldPin),

  // Folders + files
  chooseFolders: () => ipcRenderer.invoke("disc:choose-folders"),
  chooseMp3Files: () => ipcRenderer.invoke("disc:choose-mp3-files"),
  scanFolder: (folderPath) => ipcRenderer.invoke("disc:scan-folder", folderPath),
  readAudioFile: (filePath) => ipcRenderer.invoke("disc:read-audio-file", filePath),
  copyFilesIntoFolder: (folderPath, sourcePaths) =>
    ipcRenderer.invoke("disc:copy-files-into-folder", { folderPath, sourcePaths }),
  renameTrackFile: (filePath, newStem) =>
    ipcRenderer.invoke("disc:rename-track-file", { filePath, newStem }),
  watchFolder: (key, folderPath) =>
    ipcRenderer.invoke("disc:watch-folder", { key, folderPath }),
  unwatchFolder: (key) => ipcRenderer.invoke("disc:unwatch-folder", key),
  onFolderChanged: (callback) => {
    const listener = (_event, key) => callback(key);
    ipcRenderer.on("disc:folder-changed", listener);
    return () => ipcRenderer.removeListener("disc:folder-changed", listener);
  },
  deleteFile: (filePath) => ipcRenderer.invoke("disc:delete-file", filePath),
  revealInExplorer: (filePath) => ipcRenderer.send("disc:reveal-in-explorer", filePath),
  copyToClipboard: (text) => ipcRenderer.send("disc:copy-to-clipboard", text),

  // Native OS drag-out (onto Premiere's timeline).
  startDrag: (filePath) => ipcRenderer.send("disc:start-drag", filePath),
  // Electron deprecated the old `File.path` property (from ~v32 onward it's
  // unreliable/empty) in favor of this — needed for reading the real path
  // of a file the user drags in from Explorer.
  getPathForFile: (file) => webUtils.getPathForFile(file),

  // Frameless window controls + the window-snap system.
  windowMinimize: () => ipcRenderer.send("disc:window-minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("disc:window-toggle-maximize"),
  windowIsMaximized: () => ipcRenderer.invoke("disc:window-is-maximized"),
  windowClose: () => ipcRenderer.send("disc:window-close"),
  setSnapAccentColor: (hex) => ipcRenderer.send("disc:set-snap-accent-color", hex),
  notifyMouseUp: () => ipcRenderer.send("disc:mouse-up"),
  onWindowMaximizedChanged: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("disc:window-maximized-changed", listener);
    return () => ipcRenderer.removeListener("disc:window-maximized-changed", listener);
  },
});
