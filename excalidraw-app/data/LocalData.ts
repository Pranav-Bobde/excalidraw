/**
 * This file deals with saving data state (appState, elements, images, ...)
 * locally to the browser.
 *
 * Notes:
 *
 * - DataState refers to full state of the app: appState, elements, images,
 *   though some state is saved separately (collab username, library) for one
 *   reason or another. We also save different data to different storage
 *   (localStorage, indexedDB).
 * - Drawings are stored in IndexedDB via CollectionsStorage.
 * - Binary files are stored in IndexedDB scoped by drawing ID.
 */

import { clearAppStateForLocalStorage } from "@excalidraw/excalidraw/appState";
import {
  CANVAS_SEARCH_TAB,
  DEFAULT_SIDEBAR,
  debounce,
} from "@excalidraw/common";
import {
  createStore,
  entries,
  del,
  getMany,
  set,
  setMany,
  get,
} from "idb-keyval";

import { appJotaiStore, atom } from "excalidraw-app/app-jotai";
import { getNonDeletedElements } from "@excalidraw/element";

import type { LibraryPersistedData } from "@excalidraw/excalidraw/data/library";
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
import type { MaybePromise } from "@excalidraw/common/utility-types";

import { SAVE_TO_LOCAL_STORAGE_TIMEOUT, STORAGE_KEYS } from "../app_constants";

import { FileManager } from "./FileManager";
import { FileStatusStore } from "./fileStatusStore";
import { Locker } from "./Locker";
import { updateBrowserStateVersion } from "./tabSync";
import { CollectionsStorage } from "./CollectionsStorage";

const filesStore = createStore("files-db", "files-store");

export const localStorageQuotaExceededAtom = atom(false);
export const currentDrawingIdAtom = atom<string | null>(null);

const getDrawingId = (): string | null =>
  appJotaiStore.get(currentDrawingIdAtom);

class LocalFileManager extends FileManager {
  clearObsoleteFiles = async (opts: { currentFileIds: FileId[] }) => {
    const drawingId = getDrawingId();
    if (!drawingId) return;

    const allKeys = (await entries(filesStore)) as [string, BinaryFileData][];
    for (const [key, imageData] of allKeys) {
      if (!key.startsWith(`${drawingId}:`)) {
        continue;
      }
      if (
        (!imageData.lastRetrieved ||
          Date.now() - imageData.lastRetrieved > 24 * 3600 * 1000) &&
        !opts.currentFileIds.includes(
          key.replace(`${drawingId}:`, "") as FileId,
        )
      ) {
        del(key, filesStore);
      }
    }
  };
}

const saveDataStateToIndexedDB = async (
  drawingId: string,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
) => {
  const localStorageQuotaExceeded = appJotaiStore.get(
    localStorageQuotaExceededAtom,
  );
  try {
    const _appState = clearAppStateForLocalStorage(appState);

    if (
      _appState.openSidebar?.name === DEFAULT_SIDEBAR.name &&
      _appState.openSidebar.tab === CANVAS_SEARCH_TAB
    ) {
      _appState.openSidebar = null;
    }

    await CollectionsStorage.updateDrawing(drawingId, {
      elements: getNonDeletedElements(elements) as ExcalidrawElement[],
      appState: _appState,
    });
    updateBrowserStateVersion(STORAGE_KEYS.VERSION_DATA_STATE, drawingId);
    if (localStorageQuotaExceeded) {
      appJotaiStore.set(localStorageQuotaExceededAtom, false);
    }
  } catch (error: any) {
    console.error(error);
    if (isQuotaExceededError(error) && !localStorageQuotaExceeded) {
      appJotaiStore.set(localStorageQuotaExceededAtom, true);
    }
  }
};

const isQuotaExceededError = (error: any) => {
  return error instanceof DOMException && error.name === "QuotaExceededError";
};

type SavingLockTypes = "collaboration";

export class LocalData {
  private static _save = debounce(
    async (
      drawingId: string,
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
      onFilesSaved: () => void,
    ) => {
      await saveDataStateToIndexedDB(drawingId, elements, appState);

      await this.fileStorage.saveFiles({
        elements,
        files,
      });
      onFilesSaved();
    },
    SAVE_TO_LOCAL_STORAGE_TIMEOUT,
  );

  static save = (
    drawingId: string,
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
    onFilesSaved: () => void,
  ) => {
    if (!this.isSavePaused()) {
      this._save(drawingId, elements, appState, files, onFilesSaved);
    }
  };

  static flushSave = () => {
    this._save.flush();
  };

  private static locker = new Locker<SavingLockTypes>();

  static pauseSave = (lockType: SavingLockTypes) => {
    this.locker.lock(lockType);
  };

  static resumeSave = (lockType: SavingLockTypes) => {
    this.locker.unlock(lockType);
  };

  static isSavePaused = () => {
    return document.hidden || this.locker.isLocked();
  };

  // ---------------------------------------------------------------------------

  static fileStorage = new LocalFileManager({
    onFileStatusChange: FileStatusStore.updateStatuses.bind(FileStatusStore),
    getFiles(ids) {
      const drawingId = getDrawingId();
      if (!drawingId) {
        return Promise.resolve({
          loadedFiles: [] as BinaryFileData[],
          erroredFiles: new Map<FileId, true>(),
        });
      }

      return CollectionsStorage.getDrawingFiles(drawingId, ids).then(
        async (loadedMap) => {
          const loadedFiles: BinaryFileData[] = [];
          const erroredFiles = new Map<FileId, true>();

          ids.forEach((id) => {
            const data = loadedMap.get(id);
            if (data) {
              loadedFiles.push({
                ...data,
                lastRetrieved: Date.now(),
              });
            } else {
              erroredFiles.set(id, true);
            }
          });

          try {
            const pairs: [string, BinaryFileData][] = loadedFiles.map(
              (f, i) => [`${drawingId}:${ids[i]}`, f],
            );
            if (pairs.length > 0) {
              await setMany(pairs, filesStore);
            }
          } catch (error) {
            console.warn(error);
          }

          return { loadedFiles, erroredFiles };
        },
      );
    },
    async saveFiles({ addedFiles }) {
      const drawingId = getDrawingId();
      if (!drawingId) {
        return {
          savedFiles: new Map<FileId, BinaryFileData>(),
          erroredFiles: new Map<FileId, BinaryFileData>(),
        };
      }

      const savedFiles = new Map<FileId, BinaryFileData>();
      const erroredFiles = new Map<FileId, BinaryFileData>();

      updateBrowserStateVersion(STORAGE_KEYS.VERSION_FILES, drawingId);

      await Promise.all(
        [...addedFiles].map(async ([id, fileData]) => {
          try {
            await CollectionsStorage.saveDrawingFile(drawingId, id, fileData);
            savedFiles.set(id, fileData);
          } catch (error: any) {
            console.error(error);
            erroredFiles.set(id, fileData);
          }
        }),
      );

      return { savedFiles, erroredFiles };
    },
  });
}

export class LibraryIndexedDBAdapter {
  private static idb_name = STORAGE_KEYS.IDB_LIBRARY;
  private static key = "libraryData";

  private static store = createStore(
    `${LibraryIndexedDBAdapter.idb_name}-db`,
    `${LibraryIndexedDBAdapter.idb_name}-store`,
  );

  static async load() {
    const IDBData = await get<LibraryPersistedData>(
      LibraryIndexedDBAdapter.key,
      LibraryIndexedDBAdapter.store,
    );

    return IDBData || null;
  }

  static save(data: LibraryPersistedData): MaybePromise<void> {
    return set(
      LibraryIndexedDBAdapter.key,
      data,
      LibraryIndexedDBAdapter.store,
    );
  }
}

export class LibraryLocalStorageMigrationAdapter {
  static load() {
    const LSData = localStorage.getItem(
      STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_LIBRARY,
    );
    if (LSData != null) {
      const libraryItems: ImportedDataState["libraryItems"] =
        JSON.parse(LSData);
      if (libraryItems) {
        return { libraryItems };
      }
    }
    return null;
  }
  static clear() {
    localStorage.removeItem(STORAGE_KEYS.__LEGACY_LOCAL_STORAGE_LIBRARY);
  }
}
