import { isUnderDirectory } from "./paths.js";

export function isTrackMissing(track, missingFolderIds, musicFolderPath, customFolders) {
  if (
    missingFolderIds.has("main") &&
    musicFolderPath &&
    isUnderDirectory(track.filePath, musicFolderPath)
  ) {
    return true;
  }
  return customFolders.some(
    (f) =>
      f.folderPath &&
      missingFolderIds.has(f.id) &&
      isUnderDirectory(track.filePath, f.folderPath)
  );
}
