const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("disc", {
  toggleAlwaysOnTop: (shouldPin) =>
    ipcRenderer.invoke("disc:toggle-always-on-top", shouldPin),
  chooseMusicFolder: () => ipcRenderer.invoke("disc:choose-music-folder"),
  chooseMp3Files: () => ipcRenderer.invoke("disc:choose-mp3-files"),
  scanFolder: (folderPath) => ipcRenderer.invoke("disc:scan-folder", folderPath),
  readAudioFile: (filePath) => ipcRenderer.invoke("disc:read-audio-file", filePath),
  copyFilesIntoFolder: (folderPath, sourcePaths) =>
    ipcRenderer.invoke("disc:copy-files-into-folder", { folderPath, sourcePaths }),
  renameTrackFile: (filePath, newStem) =>
    ipcRenderer.invoke("disc:rename-track-file", { filePath, newStem }),
  exportFolderZip: (suggestedName, files) =>
    ipcRenderer.invoke("disc:export-folder-zip", { suggestedName, files }),
  watchFolder: (key, folderPath) =>
    ipcRenderer.invoke("disc:watch-folder", { key, folderPath }),
  unwatchFolder: (key) => ipcRenderer.invoke("disc:unwatch-folder", key),
  startDrag: (filePath) => ipcRenderer.send("disc:start-drag", filePath),
  // Electron deprecated the old `File.path` property (from ~v32 onward it's
  // unreliable/empty) in favor of this — needed for reading the real path
  // of a file the user drags in from Explorer.
  getPathForFile: (file) => webUtils.getPathForFile(file),
  windowMinimize: () => ipcRenderer.send("disc:window-minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("disc:window-toggle-maximize"),
  windowIsMaximized: () => ipcRenderer.invoke("disc:window-is-maximized"),
  windowClose: () => ipcRenderer.send("disc:window-close"),
  onWindowMaximizedChanged: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("disc:window-maximized-changed", listener);
    return () => ipcRenderer.removeListener("disc:window-maximized-changed", listener);
  },
  onFolderChanged: (callback) => {
    const listener = (_event, key) => callback(key);
    ipcRenderer.on("disc:folder-changed", listener);
    return () => ipcRenderer.removeListener("disc:folder-changed", listener);
  },
  revealInExplorer: (filePath) => ipcRenderer.send("disc:reveal-in-explorer", filePath),
  copyToClipboard: (text) => ipcRenderer.send("disc:copy-to-clipboard", text),
  deleteFile: (filePath) => ipcRenderer.invoke("disc:delete-file", filePath),
  moveFile: (sourcePath, destFolderPath) =>
    ipcRenderer.invoke("disc:move-file", { sourcePath, destFolderPath }),
  enterCompactMode: () => ipcRenderer.send("disc:enter-compact-mode"),
  exitCompactMode: () => ipcRenderer.send("disc:exit-compact-mode"),
  getMemoryLimit: () => ipcRenderer.invoke("disc:get-memory-limit"),
  setMemoryLimit: (memoryLimitMb) =>
    ipcRenderer.invoke("disc:set-memory-limit", memoryLimitMb),
  getThreadPoolSize: () => ipcRenderer.invoke("disc:get-thread-pool-size"),
  setThreadPoolSize: (threadPoolSize) =>
    ipcRenderer.invoke("disc:set-thread-pool-size", threadPoolSize),
  getCpuCount: () => ipcRenderer.invoke("disc:get-cpu-count"),
  statPath: (targetPath) => ipcRenderer.invoke("disc:stat-path", targetPath),
  chooseConvertibleFiles: () => ipcRenderer.invoke("disc:choose-convertible-files"),
  chooseConvertibleFolder: () => ipcRenderer.invoke("disc:choose-convertible-folder"),
  scanForConvertible: (rootDir) => ipcRenderer.invoke("disc:scan-for-convertible", rootDir),
  writeConvertedMp3: (destFolder, fileName, bytes) =>
    ipcRenderer.invoke("disc:write-converted-mp3", { destFolder, fileName, bytes }),
  writeTempAudio: (fileName, bytes) =>
    ipcRenderer.invoke("disc:write-temp-audio", { fileName, bytes }),
  relaunchApp: () => ipcRenderer.send("disc:relaunch"),
  listProfiles: () => ipcRenderer.invoke("disc:list-profiles"),
  saveProfile: (profileName, data, fileName) =>
    ipcRenderer.invoke("disc:save-profile", { profileName, data, fileName }),
  loadProfile: (fileName) => ipcRenderer.invoke("disc:load-profile", fileName),
  renameProfile: (fileName, newName) =>
    ipcRenderer.invoke("disc:rename-profile", { fileName, newName }),
  deleteProfile: (fileName) => ipcRenderer.invoke("disc:delete-profile", fileName),
  exportProfileToFile: (profileName, data) =>
    ipcRenderer.invoke("disc:export-profile-to-file", { profileName, data }),
  importProfileFromFile: () => ipcRenderer.invoke("disc:import-profile-from-file"),
});
