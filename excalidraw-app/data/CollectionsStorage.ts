/**
 * IndexedDB storage layer for managing multiple drawings (collections).
 *
 * Each drawing is stored with metadata (name, timestamps, thumbnail) and full
 * scene data (elements, appState). Binary files are stored in a separate store
 * scoped by drawingId.
 */

import {
  createStore,
  get,
  set,
  del,
  keys,
  getMany,
  setMany,
  update,
} from "idb-keyval";

import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type { AppState, BinaryFileData } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";

const DRAWINGS_DB_NAME = STORAGE_KEYS.IDB_DRAWINGS;
const DRAWINGS_STORE_NAME = "drawings";
const FILES_STORE_NAME = "files";

const drawingsStore = createStore(
  `${DRAWINGS_DB_NAME}-db`,
  DRAWINGS_STORE_NAME,
);

const filesStore = createStore(`${DRAWINGS_DB_NAME}-db`, FILES_STORE_NAME);

export interface DrawingRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  thumbnail: string | null;
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
}

export type DrawingMetadata = Omit<
  DrawingRecord,
  "elements" | "appState" | "thumbnail"
> & {
  thumbnail: string | null;
};

export class CollectionsStorage {
  static async listDrawings(): Promise<DrawingMetadata[]> {
    const drawingIds = (await keys(drawingsStore)) as string[];
    const records = await getMany<DrawingRecord>(drawingIds, drawingsStore);
    return records
      .filter((r): r is DrawingRecord => r !== undefined)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ id, name, createdAt, updatedAt, thumbnail }) => ({
        id,
        name,
        createdAt,
        updatedAt,
        thumbnail,
      }));
  }

  static async getDrawing(id: string): Promise<DrawingRecord | null> {
    const record = await get<DrawingRecord>(id, drawingsStore);
    return record ?? null;
  }

  static async createDrawing(overrides?: {
    name?: string;
    elements?: ExcalidrawElement[];
    appState?: Partial<AppState>;
  }): Promise<DrawingRecord> {
    const id = crypto.randomUUID();
    const now = Date.now();
    const record: DrawingRecord = {
      id,
      name: overrides?.name ?? "Untitled",
      createdAt: now,
      updatedAt: now,
      thumbnail: null,
      elements: overrides?.elements ?? [],
      appState: overrides?.appState ?? {},
    };
    await set(id, record, drawingsStore);
    return record;
  }

  static async updateDrawing(
    id: string,
    updates: {
      elements?: ExcalidrawElement[];
      appState?: Partial<AppState>;
      name?: string;
      thumbnail?: string | null;
    },
  ): Promise<DrawingRecord | null> {
    const existing = await get<DrawingRecord>(id, drawingsStore);
    if (!existing) {
      return null;
    }
    const updated: DrawingRecord = {
      ...existing,
      ...(updates.elements !== undefined && { elements: updates.elements }),
      ...(updates.appState !== undefined && { appState: updates.appState }),
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.thumbnail !== undefined && { thumbnail: updates.thumbnail }),
      updatedAt: Date.now(),
    };
    await set(id, updated, drawingsStore);
    return updated;
  }

  static async deleteDrawing(id: string): Promise<void> {
    await del(id, drawingsStore);
    await CollectionsStorage.clearDrawingFiles(id);
  }

  static async duplicateDrawing(id: string): Promise<DrawingRecord | null> {
    const source = await get<DrawingRecord>(id, drawingsStore);
    if (!source) {
      return null;
    }
    const newId = crypto.randomUUID();
    const now = Date.now();
    const record: DrawingRecord = {
      ...source,
      id: newId,
      name: `${source.name} (copy)`,
      createdAt: now,
      updatedAt: now,
      thumbnail: source.thumbnail,
      elements: JSON.parse(JSON.stringify(source.elements)),
      appState: JSON.parse(JSON.stringify(source.appState)),
    };
    await set(newId, record, drawingsStore);
    const sourceFileIds = (await keys(filesStore)) as string[];
    const sourceFiles = sourceFileIds
      .filter((k) => k.startsWith(`${id}:`))
      .map((k) => k.replace(`${id}:`, ""));
    if (sourceFiles.length > 0) {
      const fileData = await getMany<BinaryFileData>(sourceFiles, filesStore);
      const pairs: [string, BinaryFileData][] = [];
      fileData.forEach((data, i) => {
        if (data) {
          pairs.push([`${newId}:${sourceFiles[i]}`, data]);
        }
      });
      if (pairs.length > 0) {
        await setMany(pairs, filesStore);
      }
    }
    return record;
  }

  static async generateThumbnail(
    elements: ExcalidrawElement[],
    appState: AppState,
  ): Promise<string | null> {
    if (elements.length === 0) {
      return null;
    }
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return null;
      }
      const THUMB_WIDTH = 200;
      const THUMB_HEIGHT = 150;
      canvas.width = THUMB_WIDTH;
      canvas.height = THUMB_HEIGHT;
      ctx.fillStyle = appState.viewBackgroundColor || "#ffffff";
      ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
      const nonDeleted = elements.filter((el) => !el.isDeleted);
      if (nonDeleted.length === 0) {
        return null;
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const el of nonDeleted) {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + el.width);
        maxY = Math.max(maxY, el.y + el.height);
      }
      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;
      const scale = Math.min(
        (THUMB_WIDTH - 20) / contentWidth,
        (THUMB_HEIGHT - 20) / contentHeight,
        1,
      );
      const offsetX = (THUMB_WIDTH - contentWidth * scale) / 2;
      const offsetY = (THUMB_HEIGHT - contentHeight * scale) / 2;
      ctx.save();
      ctx.translate(offsetX - minX * scale, offsetY - minY * scale);
      ctx.scale(scale, scale);
      for (const el of nonDeleted) {
        ctx.save();
        if (el.type === "rectangle" || el.type === "ellipse") {
          ctx.fillStyle = el.backgroundColor || "transparent";
          ctx.strokeStyle = el.strokeColor || "#000000";
          ctx.lineWidth = el.strokeWidth || 1;
          if (el.type === "rectangle") {
            ctx.fillRect(el.x, el.y, el.width, el.height);
            ctx.strokeRect(el.x, el.y, el.width, el.height);
          } else {
            ctx.beginPath();
            ctx.ellipse(
              el.x + el.width / 2,
              el.y + el.height / 2,
              el.width / 2,
              el.height / 2,
              0,
              0,
              Math.PI * 2,
            );
            ctx.fill();
            ctx.stroke();
          }
        } else if (el.type === "text") {
          ctx.fillStyle = el.strokeColor || "#000000";
          ctx.font = `${el.fontSize || 20}px sans-serif`;
          ctx.fillText(el.text || "", el.x, el.y + (el.fontSize || 20));
        } else if (el.type === "line" || el.type === "arrow") {
          ctx.strokeStyle = el.strokeColor || "#000000";
          ctx.lineWidth = el.strokeWidth || 1;
          ctx.beginPath();
          if (el.points && el.points.length > 0) {
            ctx.moveTo(el.x + el.points[0][0], el.y + el.points[0][1]);
            for (let i = 1; i < el.points.length; i++) {
              ctx.lineTo(el.x + el.points[i][0], el.y + el.points[i][1]);
            }
          }
          ctx.stroke();
        } else if (el.type === "freedraw") {
          ctx.strokeStyle = el.strokeColor || "#000000";
          ctx.lineWidth = el.strokeWidth || 1;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          if (el.points && el.points.length > 0) {
            ctx.moveTo(el.x + el.points[0][0], el.y + el.points[0][1]);
            for (let i = 1; i < el.points.length; i++) {
              ctx.lineTo(el.x + el.points[i][0], el.y + el.points[i][1]);
            }
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
      return canvas.toDataURL("image/png", 0.7);
    } catch {
      return null;
    }
  }

  static async saveDrawingFile(
    drawingId: string,
    fileId: string,
    fileData: BinaryFileData,
  ): Promise<void> {
    await set(`${drawingId}:${fileId}`, fileData, filesStore);
  }

  static async getDrawingFiles(
    drawingId: string,
    fileIds: string[],
  ): Promise<Map<string, BinaryFileData>> {
    const prefixedIds = fileIds.map((id) => `${drawingId}:${id}`);
    const results = await getMany<BinaryFileData>(prefixedIds, filesStore);
    const map = new Map<string, BinaryFileData>();
    results.forEach((data, i) => {
      if (data) {
        map.set(fileIds[i], data);
      }
    });
    return map;
  }

  static async clearDrawingFiles(drawingId: string): Promise<void> {
    const allKeys = (await keys(filesStore)) as string[];
    const drawingKeys = allKeys.filter((k) => k.startsWith(`${drawingId}:`));
    for (const key of drawingKeys) {
      await del(key, filesStore);
    }
  }

  static getLastOpenedDrawingId(): string | null {
    return localStorage.getItem(STORAGE_KEYS.LAST_OPENED_DRAWING_ID);
  }

  static setLastOpenedDrawingId(id: string): void {
    localStorage.setItem(STORAGE_KEYS.LAST_OPENED_DRAWING_ID, id);
  }

  static clearLastOpenedDrawingId(): void {
    localStorage.removeItem(STORAGE_KEYS.LAST_OPENED_DRAWING_ID);
  }
}
