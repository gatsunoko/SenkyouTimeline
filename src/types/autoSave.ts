import type { MapPoint, ProjectData, SelectionState, ToolMode } from "./project";

export interface CanvasViewState {
  x: number;
  y: number;
  scale: number;
}

export interface AutoSaveSnapshot {
  version: 1;
  savedAt: string;
  project: ProjectData;
  selected: SelectionState;
  selectedLinePointIndices: number[];
  selectedArrowPointIndices: number[];
  routePreviewUnitId: string | null;
  unitPlacementAssetId: string | null;
  sitePlacementAssetId: string | null;
  tool: ToolMode;
  drawingPoints: MapPoint[];
  canvasView: CanvasViewState;
}
