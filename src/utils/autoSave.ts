import { useProjectStore } from "../store/projectStore";
import type { AutoSaveSnapshot } from "../types/autoSave";

const DB_NAME = "sengoku-battle-map-timeline-editor";
const DB_VERSION = 1;
const STORE_NAME = "autoSave";
const SNAPSHOT_KEY = "latest";
const META_KEY = "sengokuBattleMap:autoSaveMeta";
const AUTO_SAVE_DELAY_MS = 800;

interface AutoSaveRecord {
  id: typeof SNAPSHOT_KEY;
  snapshot: AutoSaveSnapshot;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB operation failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openAutoSaveDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function isAutoSaveSnapshot(value: unknown): value is AutoSaveSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as AutoSaveSnapshot).version === 1 &&
    typeof (value as AutoSaveSnapshot).savedAt === "string" &&
    typeof (value as AutoSaveSnapshot).project === "object"
  );
}

function createSnapshot(): AutoSaveSnapshot {
  const state = useProjectStore.getState();
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    project: state.exportProject(),
    selected: state.selected,
    selectedLinePointIndices: [...state.selectedLinePointIndices],
    selectedArrowPointIndices: [...state.selectedArrowPointIndices],
    routePreviewUnitId: state.routePreviewUnitId,
    unitPlacementAssetId: state.unitPlacementAssetId,
    sitePlacementAssetId: state.sitePlacementAssetId,
    imagePlacementAssetId: state.imagePlacementAssetId,
    imagePlacement: state.imagePlacement,
    tool: state.tool,
    drawingPoints: state.drawingPoints.map((point) => ({ ...point })),
    canvasView: { ...state.canvasView },
  };
}

export async function loadAutoSaveSnapshot(): Promise<AutoSaveSnapshot | null> {
  if (!("indexedDB" in window)) return null;
  const db = await openAutoSaveDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const record = await requestToPromise<AutoSaveRecord | undefined>(store.get(SNAPSHOT_KEY));
    return isAutoSaveSnapshot(record?.snapshot) ? record.snapshot : null;
  } finally {
    db.close();
  }
}

export async function saveAutoSaveSnapshot(snapshot: AutoSaveSnapshot): Promise<void> {
  if (!("indexedDB" in window)) return;
  const db = await openAutoSaveDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ id: SNAPSHOT_KEY, snapshot });
    await transactionDone(transaction);
    window.localStorage.setItem(
      META_KEY,
      JSON.stringify({
        savedAt: snapshot.savedAt,
        projectName: snapshot.project.projectName,
      }),
    );
  } finally {
    db.close();
  }
}

export async function clearAutoSaveSnapshot(): Promise<void> {
  if (!("indexedDB" in window)) return;
  const db = await openAutoSaveDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
    await transactionDone(transaction);
    window.localStorage.removeItem(META_KEY);
  } finally {
    db.close();
  }
}

export function setupAutoSave(): () => void {
  let saveTimer: number | null = null;

  const scheduleSave = () => {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      const snapshot = createSnapshot();
      void saveAutoSaveSnapshot(snapshot).catch((error) => {
        console.warn("Auto save failed", error);
      });
    }, AUTO_SAVE_DELAY_MS);
  };

  const unsubscribe = useProjectStore.subscribe(scheduleSave);

  return () => {
    unsubscribe();
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
  };
}
