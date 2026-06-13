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
  selectedRegionPointIndices: number[];
  selectedLinePointIndices: number[];
  selectedArrowPointIndices: number[];
  routePreviewUnitId: string | null;
  unitPlacementAssetId: string | null;
  sitePlacementAssetId: string | null;
  imagePlacementAssetId: string | null;
  imagePlacement: { dataUrl: string; name: string; naturalWidth?: number; naturalHeight?: number; assetId?: string; size?: number } | null;
  tool: ToolMode;
  drawingPoints: MapPoint[];
  canvasView: CanvasViewState;
}
