import { STORAGE_KEYS } from "../app_constants";

const LOCAL_STATE_VERSIONS: Record<string, number> = {};

type BrowserStateTypes =
  | typeof STORAGE_KEYS.VERSION_DATA_STATE
  | typeof STORAGE_KEYS.VERSION_FILES;

const getStorageKey = (type: BrowserStateTypes, drawingId: string) =>
  `${type}-${drawingId}`;

const getLocalVersion = (type: BrowserStateTypes, drawingId: string) => {
  const key = getStorageKey(type, drawingId);
  if (LOCAL_STATE_VERSIONS[key] === undefined) {
    LOCAL_STATE_VERSIONS[key] = -1;
  }
  return LOCAL_STATE_VERSIONS[key];
};

export const isBrowserStorageStateNewer = (
  type: BrowserStateTypes,
  drawingId: string,
) => {
  const storageKey = getStorageKey(type, drawingId);
  const storageTimestamp = JSON.parse(localStorage.getItem(storageKey) || "-1");
  return storageTimestamp > getLocalVersion(type, drawingId);
};

export const updateBrowserStateVersion = (
  type: BrowserStateTypes,
  drawingId: string,
) => {
  const timestamp = Date.now();
  const storageKey = getStorageKey(type, drawingId);
  try {
    localStorage.setItem(storageKey, JSON.stringify(timestamp));
    LOCAL_STATE_VERSIONS[storageKey] = timestamp;
  } catch (error) {
    console.error("error while updating browser state version", error);
  }
};

export const resetBrowserStateVersions = (drawingId?: string) => {
  try {
    const types: BrowserStateTypes[] = [
      STORAGE_KEYS.VERSION_DATA_STATE,
      STORAGE_KEYS.VERSION_FILES,
    ];
    if (drawingId) {
      for (const type of types) {
        const storageKey = getStorageKey(type, drawingId);
        const timestamp = -1;
        localStorage.setItem(storageKey, JSON.stringify(timestamp));
        LOCAL_STATE_VERSIONS[storageKey] = timestamp;
      }
    } else {
      for (const key of Object.keys(LOCAL_STATE_VERSIONS)) {
        const timestamp = -1;
        localStorage.setItem(key, JSON.stringify(timestamp));
        LOCAL_STATE_VERSIONS[key] = timestamp;
      }
    }
  } catch (error) {
    console.error("error while resetting browser state version", error);
  }
};
