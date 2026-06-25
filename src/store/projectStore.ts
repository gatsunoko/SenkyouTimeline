import { create } from "zustand";
import { sampleProjects } from "../data/sampleProjects";
import type {
  BattleArrow,
  BattleEvent,
  BattleLine,
  CameraKeyframe,
  CameraLegendSettings,
  CanvasMapImage,
  Certainty,
  ExportCamera,
  Faction,
  ImageAsset,
  LabelKeyframe,
  MapLabel,
  MapPoint,
  MapRegion,
  PlacedImage,
  PlacedImageKeyframe,
  ProjectData,
  RegionKeyframe,
  SelectionState,
  SelectionMoveUpdate,
  Site,
  SiteAsset,
  ToolMode,
  Unit,
  UnitAsset,
  UnitKeyframe,
  UnitRoute,
  UnitRouteSegment,
} from "../types/project";
import type { AutoSaveSnapshot, CanvasViewState } from "../types/autoSave";
import { clampPoint } from "../utils/coordinate";
import { createId } from "../utils/id";
import { compareTime, formatTimelineLabel, getCurrentFrame, parseTimelineSeconds, sortedFrames } from "../utils/time";
import { cloneProject, trimHistory } from "./historyStore";
import { getUnitRouteSegments, getUnitRouteTimeRange, resolveArrowKeyframe, resolveArrowRoutePoints, resolveCameraFrame, resolveLabelFrame, resolveLineKeyframe, resolveLineRoutePoints, resolvePlacedImageFrame, resolveRegionKeyframe, resolveSiteFrame, resolveUnitFrame, resolveUnitRoutePoint } from "../utils/interpolation";

const emptyProject: ProjectData = {
  version: "1.0.0",
  projectName: "新規戦況図",
  description: "表示確認用のデータ。",
  cameraLegend: { showFactions: true, factionSize: 1, position: "top-left", backgroundEnabled: false, backgroundColor: "#111827", backgroundOpacity: 0.65, textBold: true },
  timeline: {
    start: "0",
    end: "12",
    currentTime: "0",
    calendarType: "custom",
    defaultStep: "1s",
    interpolationMode: "linear",
    frames: [
      { id: "frame_1", time: "0", displayDate: "00:00.0", order: 1, memo: "" },
      { id: "frame_2", time: "5", displayDate: "00:05.0", order: 2, memo: "" },
      { id: "frame_3", time: "10", displayDate: "00:10.0", order: 3, memo: "" },
    ],
  },
  map: { outputWidth: 1920, outputHeight: 1080 },
  unitAssets: [],
  siteAssets: [],
  imageAssets: [],
  factions: [
    { id: "faction_default_a", name: "織田・徳川連合", color: "#2f7ed8", showInCameraLegend: false, cameraLegendTextOutlineColor: "#111827", memo: "" },
    { id: "faction_default_b", name: "武田家", color: "#c3423f", showInCameraLegend: false, cameraLegendTextOutlineColor: "#111827", memo: "" },
  ],
  sites: [],
  images: [],
  units: [],
  regions: [],
  lines: [],
  arrows: [],
  events: [],
  labels: [],
};

function createBlankProject(): ProjectData {
  return {
    ...cloneProject(emptyProject),
    timeline: {
      ...emptyProject.timeline,
      start: "0.0",
      end: "0.0",
      currentTime: "0.0",
      frames: [{ id: createId("frame"), time: "0.0", displayDate: "00:00.0", order: 1, memo: "" }],
    },
    map: {
      outputWidth: 1920,
      outputHeight: 1080,
      exportCamera: {
        width: 1920,
        height: 1080,
        scale: 1,
        keyframes: [{ time: "0.0", displayDate: "00:00.0", x: 0, y: 0, scale: 1 }],
      },
    },
    unitAssets: [],
    siteAssets: [],
    imageAssets: [],
    sites: [],
    images: [],
    units: [],
    lines: [],
    arrows: [],
    events: [],
    labels: [],
  };
}

type ProjectMutator = (project: ProjectData) => void;
type TimedEntry = { time: string; displayDate?: string };

const defaultCanvasView: CanvasViewState = { x: 40, y: 30, scale: 0.58 };

function placedImageDisplayOrder(image: PlacedImage, fallbackIndex: number) {
  return Number.isFinite(image.displayOrder) ? image.displayOrder ?? fallbackIndex : fallbackIndex;
}

function sortPlacedImagesByDisplayOrder(images: PlacedImage[]) {
  return images
    .map((image, index) => ({ image, index, order: placedImageDisplayOrder(image, index) }))
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .map(({ image }) => image);
}

function normalizePlacedImageDisplayOrder(images: PlacedImage[]) {
  const ordered = sortPlacedImagesByDisplayOrder(images);
  ordered.forEach((image, index) => {
    image.displayOrder = index;
  });
  return ordered;
}

interface ProjectStore {
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
  historyPast: ProjectData[];
  historyFuture: ProjectData[];
  createNewProject: () => void;
  loadProject: (project: ProjectData) => void;
  restoreAutoSaveState: (snapshot: AutoSaveSnapshot) => void;
  updateProjectName: (name: string) => void;
  updateCameraLegend: (patch: Partial<CameraLegendSettings>) => void;
  setCurrentTime: (time: string) => void;
  setTimelineEnd: (seconds: number) => void;
  addFaction: () => void;
  updateFaction: (id: string, patch: Partial<Faction>) => void;
  deleteFaction: (id: string) => void;
  addUnit: (point?: MapPoint) => void;
  setUnitImage: (unitId: string, imageDataUrl: string) => void;
  clearUnitImage: (unitId: string) => void;
  registerUnitAsset: (unitId: string) => void;
  duplicateUnitFromAsset: (assetId: string, point?: MapPoint) => void;
  deleteUnitAsset: (assetId: string) => void;
  updateUnit: (id: string, patch: Partial<Unit>) => void;
  setUnitRoute: (id: string, route?: UnitRoute) => void;
  toggleUnitRoutePreview: (id: string) => void;
  deleteUnit: (id: string) => void;
  addSite: (point?: MapPoint) => void;
  setSiteImage: (siteId: string, imageDataUrl: string) => void;
  clearSiteImage: (siteId: string) => void;
  registerSiteAsset: (siteId: string) => void;
  duplicateSiteFromAsset: (assetId: string, point?: MapPoint) => void;
  deleteSiteAsset: (assetId: string) => void;
  updateSite: (id: string, patch: Partial<Site>) => void;
  updateSiteKeyframe: (siteId: string, time: string, patch: { factionId: string }) => void;
  deleteSiteKeyframe: (siteId: string, time: string) => void;
  deleteSite: (id: string) => void;
  addImage: (point?: MapPoint) => void;
  updateImage: (id: string, patch: Partial<PlacedImage>) => void;
  moveImageOrder: (id: string, direction: "up" | "down") => void;
  registerImageAsset: (imageId: string) => void;
  deleteImageAsset: (assetId: string) => void;
  updateImageKeyframe: (imageId: string, time: string, keyframe: Partial<PlacedImageKeyframe>) => void;
  deleteImageKeyframe: (imageId: string, time: string) => void;
  deleteImage: (id: string) => void;
  addRegion: (points?: MapPoint[]) => void;
  updateRegion: (id: string, patch: Partial<MapRegion>) => void;
  updateRegionPoints: (id: string, points: MapPoint[]) => void;
  deleteRegionKeyframe: (regionId: string, time: string) => void;
  deleteRegion: (id: string) => void;
  addLine: (points?: MapPoint[]) => void;
  updateLine: (id: string, patch: Partial<BattleLine>) => void;
  updateLineKeyframe: (lineId: string, time: string, points: MapPoint[]) => void;
  deleteLineKeyframe: (lineId: string, time: string) => void;
  deleteLine: (id: string) => void;
  addArrow: (points?: MapPoint[]) => void;
  updateArrow: (id: string, patch: Partial<BattleArrow>) => void;
  updateArrowKeyframe: (arrowId: string, time: string, points: MapPoint[]) => void;
  deleteArrowKeyframe: (arrowId: string, time: string) => void;
  deleteArrow: (id: string) => void;
  addEvent: (point?: MapPoint) => void;
  updateEvent: (id: string, patch: Partial<BattleEvent>) => void;
  deleteEvent: (id: string) => void;
  addLabel: (point?: MapPoint) => void;
  updateLabel: (id: string, patch: Partial<MapLabel>) => void;
  updateLabelKeyframe: (labelId: string, time: string, keyframe: Partial<LabelKeyframe>) => void;
  deleteLabelKeyframe: (labelId: string, time: string) => void;
  deleteLabel: (id: string) => void;
  moveSelectionItems: (updates: SelectionMoveUpdate[]) => void;
  selectObject: (type: SelectionState["type"], id: string | null) => void;
  toggleRegionPointSelection: (regionId: string, pointIndex: number) => void;
  setRegionPointSelection: (regionId: string, pointIndices: number[]) => void;
  toggleLinePointSelection: (lineId: string, pointIndex: number) => void;
  toggleArrowPointSelection: (arrowId: string, pointIndex: number) => void;
  clearRegionPointSelection: () => void;
  clearLinePointSelection: () => void;
  clearArrowPointSelection: () => void;
  clearSelection: () => void;
  updateUnitKeyframe: (unitId: string, time: string, keyframe: Partial<UnitKeyframe>) => void;
  deleteUnitKeyframe: (unitId: string, time: string) => void;
  setMapImage: (dataUrl: string, naturalSize?: { width: number; height: number }, name?: string) => string;
  updateMapImagePlacement: (id: string, patch: Partial<Pick<CanvasMapImage, "imageX" | "imageY" | "imageWidth" | "imageHeight" | "opacity" | "name">>) => void;
  moveMapImageOrder: (id: string, direction: "up" | "down") => void;
  deleteMapImage: (id: string) => void;
  updateExportCamera: (patch: Partial<Pick<ExportCamera, "width" | "height" | "scale">>) => void;
  updateCameraKeyframe: (time: string, patch: Partial<MapPoint & { scale: number }>) => void;
  deleteCameraKeyframe: (time: string) => void;
  exportProject: () => ProjectData;
  importProject: (project: ProjectData) => void;
  setTool: (tool: ToolMode) => void;
  setUnitPlacementAsset: (assetId: string | null) => void;
  setSitePlacementAsset: (assetId: string | null) => void;
  setImagePlacement: (placement: { dataUrl: string; name: string; naturalWidth?: number; naturalHeight?: number; assetId?: string; size?: number } | null) => void;
  setImagePlacementAsset: (assetId: string | null) => void;
  setCanvasView: (view: Partial<CanvasViewState>) => void;
  addDrawingPoint: (point: MapPoint) => void;
  cancelDrawing: () => void;
  finishDrawing: () => void;
  deleteSelected: () => void;
  undo: () => void;
  redo: () => void;
}

function currentFrame(project: ProjectData) {
  return getCurrentFrame(project.timeline.frames, project.timeline.currentTime);
}

function firstFactionId(project: ProjectData) {
  return project.factions[0]?.id ?? "faction_default_a";
}

function clampPixelValue(value: number | undefined, fallback: number, min: number, max: number) {
  const next = Number.isFinite(value) ? Number(value) : fallback;
  return Math.round(Math.min(max, Math.max(min, next)));
}

function clampCameraScale(value: number | undefined, fallback = 1) {
  const next = Number.isFinite(value) ? Number(value) : fallback;
  return Math.round(Math.min(8, Math.max(0.1, next)) * 10) / 10;
}

function clampLegendSize(value: number | undefined, fallback = 1) {
  const next = Number.isFinite(value) ? Number(value) : fallback;
  return Math.round(Math.min(3, Math.max(0.5, next)) * 10) / 10;
}

function clampOpacity(value: number | undefined, fallback = 0.65) {
  const next = Number.isFinite(value) ? Number(value) : fallback;
  return Math.round(Math.min(1, Math.max(0, next)) * 100) / 100;
}

function clampLabelBorderWidth(value: number | undefined, fallback = 2) {
  const next = Number.isFinite(value) ? Number(value) : fallback;
  return Math.round(Math.min(16, Math.max(0, next)) * 10) / 10;
}

function fitImageToMap(project: ProjectData, naturalWidth: number, naturalHeight: number) {
  const mapWidth = project.map.width ?? 1600;
  const mapHeight = project.map.height ?? 900;
  const imageAspect = naturalWidth / naturalHeight;
  const mapAspect = mapWidth / mapHeight;
  if (!Number.isFinite(imageAspect) || imageAspect <= 0) {
    return { imageX: 0, imageY: 0, imageWidth: mapWidth, imageHeight: mapHeight };
  }
  if (imageAspect > mapAspect) {
    const imageWidth = mapWidth;
    const imageHeight = mapWidth / imageAspect;
    return { imageX: 0, imageY: (mapHeight - imageHeight) / 2, imageWidth, imageHeight };
  }
  const imageHeight = mapHeight;
  const imageWidth = mapHeight * imageAspect;
  return { imageX: (mapWidth - imageWidth) / 2, imageY: 0, imageWidth, imageHeight };
}

function getMapImageAspect(image: Partial<CanvasMapImage>) {
  const naturalAspect =
    image.imageNaturalWidth && image.imageNaturalHeight && image.imageNaturalWidth > 0 && image.imageNaturalHeight > 0
      ? image.imageNaturalWidth / image.imageNaturalHeight
      : null;
  if (naturalAspect && Number.isFinite(naturalAspect) && naturalAspect > 0) return naturalAspect;
  const placedAspect = image.imageWidth && image.imageHeight && image.imageWidth > 0 && image.imageHeight > 0 ? image.imageWidth / image.imageHeight : null;
  if (placedAspect && Number.isFinite(placedAspect) && placedAspect > 0) return placedAspect;
  return 16 / 9;
}

function resizeMapImageWithAspect(image: Partial<CanvasMapImage>, size: number, source: "width" | "height" = "width") {
  const aspect = getMapImageAspect(image);
  if (source === "height") {
    const imageHeight = clampPixelValue(size, image.imageHeight ?? 900, 16, 20000);
    const imageWidth = clampPixelValue(imageHeight * aspect, image.imageWidth ?? 1600, 16, 20000);
    return { imageWidth, imageHeight: clampPixelValue(imageWidth / aspect, imageHeight, 16, 20000) };
  }
  const imageWidth = clampPixelValue(size, image.imageWidth ?? 1600, 16, 20000);
  const imageHeight = clampPixelValue(imageWidth / aspect, image.imageHeight ?? 900, 16, 20000);
  return { imageWidth: clampPixelValue(imageHeight * aspect, imageWidth, 16, 20000), imageHeight };
}

function normalizeMapImages(project: ProjectData) {
  const map = project.map;
  map.images ||= [];
  if (map.imageDataUrl) {
    map.images.push({
      id: createId("map_image"),
      name: "\u5730\u56f3\u753b\u50cf",
      imageDataUrl: map.imageDataUrl,
      imagePath: map.imagePath,
      imageX: map.imageX,
      imageY: map.imageY,
      imageWidth: map.imageWidth,
      imageHeight: map.imageHeight,
      imageNaturalWidth: map.imageNaturalWidth,
      imageNaturalHeight: map.imageNaturalHeight,
      opacity: 1,
    });
    delete map.imageDataUrl;
    delete map.imagePath;
    delete map.imageX;
    delete map.imageY;
    delete map.imageWidth;
    delete map.imageHeight;
    delete map.imageNaturalWidth;
    delete map.imageNaturalHeight;
  }
  map.images = map.images
    .filter((image): image is CanvasMapImage => Boolean(image?.imageDataUrl))
    .map((image, index) => {
      image.id ||= createId("map_image");
      image.name ||= `\u5730\u56f3\u753b\u50cf${index + 1}`;
      image.opacity = clampOpacity(image.opacity, 1);
      if (image.imageNaturalWidth && image.imageNaturalHeight && (image.imageWidth === undefined || image.imageHeight === undefined)) {
        Object.assign(image, fitImageToMap(project, image.imageNaturalWidth, image.imageNaturalHeight));
      } else if (image.imageWidth !== undefined) {
        Object.assign(image, resizeMapImageWithAspect(image, image.imageWidth, "width"));
      }
      image.imageX = clampPixelValue(image.imageX, image.imageX ?? 0, -20000, 20000);
      image.imageY = clampPixelValue(image.imageY, image.imageY ?? 0, -20000, 20000);
      return image;
    });
}
function removeLegacyAbbrevName(entry: unknown) {
  const legacyKey = ["short", "Name"].join("");
  if (entry && typeof entry === "object" && legacyKey in entry) {
    delete (entry as Record<string, unknown>)[legacyKey];
  }
}

function normalizeExportCamera(project: ProjectData) {
  const width = clampPixelValue(project.map.exportCamera?.width ?? project.map.outputWidth, 1920, 64, 7680);
  const height = clampPixelValue(project.map.exportCamera?.height ?? project.map.outputHeight, 1080, 64, 4320);
  const scale = clampCameraScale(project.map.exportCamera?.scale, 1);
  const fallbackTime = project.timeline?.currentTime || project.timeline?.start || "0";
  const fallbackFrame = getCurrentFrame(project.timeline?.frames ?? [], fallbackTime);
  const keyframes =
    project.map.exportCamera?.keyframes && project.map.exportCamera.keyframes.length > 0
      ? project.map.exportCamera.keyframes
      : [
          {
            time: fallbackFrame?.time ?? fallbackTime,
            displayDate: fallbackFrame?.displayDate ?? formatTimelineLabel(fallbackTime),
            x: 0,
            y: 0,
            scale,
          },
        ];
  project.map.outputWidth = width;
  project.map.outputHeight = height;
  project.map.exportCamera = {
    width,
    height,
    scale,
    keyframes: keyframes.map((keyframe) => ({
      time: keyframe.time || fallbackTime,
      displayDate: keyframe.displayDate || formatTimelineLabel(keyframe.time || fallbackTime),
      x: Number.isFinite(keyframe.x) ? keyframe.x : 0,
      y: Number.isFinite(keyframe.y) ? keyframe.y : 0,
      scale: clampCameraScale(keyframe.scale, scale),
    })),
  };
  project.map.exportCamera.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
}

function routeSegmentRefs(route?: UnitRoute): UnitRouteSegment[] {
  if (!route) return [];
  return route.segments && route.segments.length > 0 ? route.segments : [route];
}

function syncRouteRoot(route?: UnitRoute) {
  const first = routeSegmentRefs(route)[0];
  if (!route || !first) return;
  route.id = first.id;
  route.sourceType = first.sourceType;
  route.sourceId = first.sourceId;
  route.startTime = first.startTime;
  route.endTime = first.endTime;
  route.direction = first.direction;
  route.fallbackPoints = first.fallbackPoints?.map((point) => ({ ...point }));
}

function routeSnapshotPoints(project: ProjectData, segment: UnitRouteSegment, preferredTime?: string) {
  const routeTime = preferredTime ?? segment.startTime ?? project.timeline.currentTime;
  const points =
    segment.sourceType === "line"
      ? (() => {
          const line = project.lines.find((entry) => entry.id === segment.sourceId);
          return line ? resolveLineRoutePoints(line, routeTime, project.timeline.interpolationMode) : null;
        })()
      : (() => {
          const arrow = project.arrows.find((entry) => entry.id === segment.sourceId);
          return arrow ? resolveArrowRoutePoints(arrow, routeTime, project.timeline.interpolationMode) : null;
        })();
  return points?.map((point) => ({ ...point })) ?? segment.fallbackPoints?.map((point) => ({ ...point }));
}

function normalizeUnitRoute(project: ProjectData, route: UnitRoute): UnitRoute | undefined {
  const segments = getUnitRouteSegments(route).map((segment) => {
    const startTime = segment.startTime || project.timeline.currentTime;
    const endTime = segment.endTime || startTime;
    const normalizedSegment: UnitRouteSegment = {
      ...segment,
      id: segment.id || createId("route_segment"),
      startTime,
      endTime: compareTime(startTime, endTime) > 0 ? startTime : endTime,
      direction: segment.direction ?? "forward",
    };
    normalizedSegment.fallbackPoints = routeSnapshotPoints(project, normalizedSegment, normalizedSegment.startTime);
    return normalizedSegment;
  });
  if (segments.length === 0) return undefined;
  return { ...segments[0], segments };
}

function revealRouteSourceIfUnused(project: ProjectData, route?: UnitRoute) {
  if (!route) return;
  const sources = new Map<string, UnitRouteSegment>();
  for (const segment of getUnitRouteSegments(route)) {
    sources.set(`${segment.sourceType}:${segment.sourceId}`, segment);
  }

  for (const segment of sources.values()) {
    const stillUsed = project.units.some((unit) => getUnitRouteSegments(unit.route).some((candidate) => candidate.sourceType === segment.sourceType && candidate.sourceId === segment.sourceId));
    if (stillUsed) continue;

    if (segment.sourceType === "line") {
      const line = project.lines.find((entry) => entry.id === segment.sourceId);
      if (line) line.hideWhenRoute = false;
    } else {
      const arrow = project.arrows.find((entry) => entry.id === segment.sourceId);
      if (arrow) arrow.hideWhenRoute = false;
    }
  }
}

function commit(set: (partial: Partial<ProjectStore>) => void, get: () => ProjectStore, mutator: ProjectMutator) {
  const previous = get().project;
  const next = cloneProject(previous);
  mutator(next);
  normalizeProjectTiming(next);
  normalizeTimelineFrames(next);
  const currentSelected = get().selected;
  set({
    project: next,
    selected: currentSelected,
    historyPast: trimHistory([...get().historyPast, previous]),
    historyFuture: [],
  });
}

function applyListPatch<T extends { id: string }>(items: T[], id: string, patch: Partial<T>) {
  const item = items.find((entry) => entry.id === id);
  if (item) Object.assign(item, patch);
}

function normalizeCanvasView(view?: Partial<CanvasViewState>): CanvasViewState {
  const xValue = view?.x;
  const yValue = view?.y;
  const scaleValue = view?.scale;
  const x = typeof xValue === "number" && Number.isFinite(xValue) ? xValue : defaultCanvasView.x;
  const y = typeof yValue === "number" && Number.isFinite(yValue) ? yValue : defaultCanvasView.y;
  const scale = typeof scaleValue === "number" && Number.isFinite(scaleValue) ? scaleValue : defaultCanvasView.scale;
  return {
    x,
    y,
    scale: Math.min(2.8, Math.max(0.25, scale)),
  };
}

function applyUnitPositionKeyframe(project: ProjectData, unitId: string, time: string, patch: Pick<UnitKeyframe, "x" | "y">) {
  const unit = project.units.find((entry) => entry.id === unitId);
  if (!unit) return;
  const frame = ensureTimelineFrame(project, time);
  const keyframeTime = frame.time;
  const targetSeconds = parseTimelineSeconds(keyframeTime);
  const existing = unit.keyframes.find((entry) => Math.abs(parseTimelineSeconds(entry.time) - targetSeconds) < 0.05);
  const resolved = resolveUnitFrame(unit, keyframeTime, project.timeline.interpolationMode);
  const point = clampPoint(patch);

  if (existing) {
    existing.x = point.x;
    existing.y = point.y;
    existing.time = keyframeTime;
    existing.displayDate = frame.displayDate ?? formatTimelineLabel(keyframeTime);
  } else {
    unit.keyframes.push({
      time: keyframeTime,
      displayDate: frame.displayDate ?? formatTimelineLabel(keyframeTime),
      x: point.x,
      y: point.y,
      rotation: resolved?.rotation ?? 0,
      status: unit.status,
      factionId: resolved?.effectiveFactionId,
      certainty: resolved?.effectiveCertainty,
      sourceNote: unit.sourceNote,
    });
  }
  unit.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
}

function applyLinePointsKeyframe(project: ProjectData, lineId: string, time: string, points: MapPoint[]) {
  const line = project.lines.find((entry) => entry.id === lineId);
  if (!line) return;
  const frame = getCurrentFrame(project.timeline.frames, time);
  const targetSeconds = parseTimelineSeconds(time);
  const existing = line.keyframes.find((entry) => Math.abs(parseTimelineSeconds(entry.time) - targetSeconds) < 0.05);
  const normalizedPoints = points.map(clampPoint);
  if (existing) {
    existing.points = normalizedPoints;
  } else {
    line.keyframes.push({
      time,
      displayDate: frame?.displayDate ?? formatTimelineLabel(time),
      points: normalizedPoints,
      sourceNote: line.sourceNote,
    });
  }
  line.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
  const routePoints = resolveLineRoutePoints(line, time, project.timeline.interpolationMode) ?? normalizedPoints;
  for (const unit of project.units) {
    for (const segment of routeSegmentRefs(unit.route)) {
      if (segment.sourceType === "line" && segment.sourceId === lineId) {
        segment.fallbackPoints = routePoints.map((point) => ({ ...point }));
      }
    }
    syncRouteRoot(unit.route);
  }
}

function applyArrowPointsKeyframe(project: ProjectData, arrowId: string, time: string, points: MapPoint[]) {
  const arrow = project.arrows.find((entry) => entry.id === arrowId);
  if (!arrow) return;
  const frame = getCurrentFrame(project.timeline.frames, time);
  arrow.keyframes ||= [
    {
      time: arrow.startTime,
      displayDate: formatTimelineLabel(arrow.startTime),
      points: arrow.points.map((point) => ({ ...point })),
      sourceNote: arrow.sourceNote,
    },
  ];
  const existing = arrow.keyframes.find((entry) => entry.time === time);
  const normalizedPoints = points.map(clampPoint);
  if (existing) {
    existing.points = normalizedPoints;
  } else {
    arrow.keyframes.push({
      time,
      displayDate: frame?.displayDate ?? formatTimelineLabel(time),
      points: normalizedPoints,
      sourceNote: arrow.sourceNote,
    });
  }
  arrow.points = normalizedPoints;
  arrow.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
  const routePoints = resolveArrowRoutePoints(arrow, time, project.timeline.interpolationMode) ?? normalizedPoints;
  for (const unit of project.units) {
    for (const segment of routeSegmentRefs(unit.route)) {
      if (segment.sourceType === "arrow" && segment.sourceId === arrowId) {
        segment.fallbackPoints = routePoints.map((point) => ({ ...point }));
      }
    }
    syncRouteRoot(unit.route);
  }
}

function applyRegionPointsKeyframe(project: ProjectData, regionId: string, time: string, points: MapPoint[]) {
  const region = project.regions.find((entry) => entry.id === regionId);
  if (!region || region.locked || points.length < 3) return;
  const frame = ensureTimelineFrame(project, time);
  const keyframeTime = frame.time;
  const targetSeconds = parseTimelineSeconds(keyframeTime);
  const normalizedPoints = points.map(clampPoint);
  region.keyframes ||= [
    {
      time: region.displayStartTime ?? keyframeTime,
      displayDate: getCurrentFrame(project.timeline.frames, region.displayStartTime ?? keyframeTime)?.displayDate ?? formatTimelineLabel(region.displayStartTime ?? keyframeTime),
      points: (region.points ?? normalizedPoints).map(clampPoint),
    },
  ];
  const existing = region.keyframes.find((entry) => Math.abs(parseTimelineSeconds(entry.time) - targetSeconds) < 0.05);
  if (existing) {
    existing.time = keyframeTime;
    existing.displayDate = frame.displayDate ?? formatTimelineLabel(keyframeTime);
    existing.points = normalizedPoints;
  } else {
    region.keyframes.push({
      time: keyframeTime,
      displayDate: frame.displayDate ?? formatTimelineLabel(keyframeTime),
      points: normalizedPoints,
    });
  }
  region.points = normalizedPoints;
  region.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
}

function applyPlacedImagePositionKeyframe(project: ProjectData, imageId: string, time: string, point: MapPoint) {
  const image = project.images.find((entry) => entry.id === imageId);
  if (!image) return;
  const frame = ensureTimelineFrame(project, time);
  const keyframeTime = frame.time;
  const targetSeconds = parseTimelineSeconds(keyframeTime);
  const existing = image.keyframes.find((entry) => Math.abs(parseTimelineSeconds(entry.time) - targetSeconds) < 0.05);
  const resolved = resolvePlacedImageFrame(image, keyframeTime, project.timeline.interpolationMode);
  const normalizedPoint = clampPoint(point);
  const next: PlacedImageKeyframe = {
    time: keyframeTime,
    displayDate: frame.displayDate ?? formatTimelineLabel(keyframeTime),
    x: normalizedPoint.x ?? resolved.x,
    y: normalizedPoint.y ?? resolved.y,
  };
  if (existing) Object.assign(existing, next);
  else image.keyframes.push(next);
  image.x = next.x;
  image.y = next.y;
  image.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
}

function applyLabelPositionKeyframe(project: ProjectData, labelId: string, time: string, point: MapPoint) {
  const label = project.labels.find((entry) => entry.id === labelId);
  if (!label || label.locked) return;
  const frame = ensureTimelineFrame(project, time);
  const keyframeTime = frame.time;
  const targetSeconds = parseTimelineSeconds(keyframeTime);
  label.keyframes ||= [
    {
      time: label.startTime ?? keyframeTime,
      displayDate: getCurrentFrame(project.timeline.frames, label.startTime ?? keyframeTime)?.displayDate ?? formatTimelineLabel(label.startTime ?? keyframeTime),
      x: label.x,
      y: label.y,
    },
  ];
  const existing = label.keyframes.find((entry) => Math.abs(parseTimelineSeconds(entry.time) - targetSeconds) < 0.05);
  const resolved = resolveLabelFrame(label, keyframeTime, project.timeline.interpolationMode);
  const normalizedPoint = clampPoint(point);
  const next: LabelKeyframe = {
    time: keyframeTime,
    displayDate: frame.displayDate ?? formatTimelineLabel(keyframeTime),
    x: normalizedPoint.x ?? resolved.x,
    y: normalizedPoint.y ?? resolved.y,
  };
  if (existing) Object.assign(existing, next);
  else label.keyframes.push(next);
  label.x = next.x;
  label.y = next.y;
  label.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
}

function isSameTime(a: string, b: string) {
  return Math.abs(parseTimelineSeconds(a) - parseTimelineSeconds(b)) < 0.05;
}

function extendObjectDisplayEnds(project: ProjectData, previousEndSeconds: number, nextEndTime: string) {
  const nextEndSeconds = parseTimelineSeconds(nextEndTime);
  if (!Number.isFinite(previousEndSeconds) || !Number.isFinite(nextEndSeconds) || nextEndSeconds <= previousEndSeconds + 0.05) return;
  const matchesPreviousEnd = (time?: string) => Boolean(time && Math.abs(parseTimelineSeconds(time) - previousEndSeconds) < 0.05);

  for (const unit of project.units) {
    if (matchesPreviousEnd(unit.displayEndTime)) unit.displayEndTime = nextEndTime;
  }
  for (const line of project.lines) {
    if (matchesPreviousEnd(line.displayEndTime)) line.displayEndTime = nextEndTime;
  }
  for (const region of project.regions) {
    if (matchesPreviousEnd(region.displayEndTime)) region.displayEndTime = nextEndTime;
  }
  for (const arrow of project.arrows) {
    if (matchesPreviousEnd(arrow.endTime)) arrow.endTime = nextEndTime;
  }
  for (const label of project.labels) {
    if (matchesPreviousEnd(label.endTime)) label.endTime = nextEndTime;
  }
}

function hasObjectKeyAtTime(project: ProjectData, time: string) {
  return (
    project.units.some((unit) => unit.keyframes.some((keyframe) => isSameTime(keyframe.time, time))) ||
    project.sites.some((site) => (site.keyframes ?? []).some((keyframe) => isSameTime(keyframe.time, time))) ||
    project.images.some((image) => (image.keyframes ?? []).some((keyframe) => isSameTime(keyframe.time, time))) ||
    project.regions.some((region) => (region.keyframes ?? []).some((keyframe) => isSameTime(keyframe.time, time))) ||
    project.lines.some((line) => line.keyframes.some((keyframe) => isSameTime(keyframe.time, time))) ||
    project.arrows.some((arrow) => (arrow.keyframes ?? []).some((keyframe) => isSameTime(keyframe.time, time))) ||
    project.labels.some((label) => (label.keyframes ?? []).some((keyframe) => isSameTime(keyframe.time, time))) ||
    (project.map.exportCamera?.keyframes ?? []).some((keyframe) => isSameTime(keyframe.time, time))
  );
}

function cleanupEmptyTimelineFrames(project: ProjectData) {
  if (project.timeline.frames.length <= 1) return;
  const originalFrames = sortedFrames(project.timeline.frames);
  const lastFrameIndex = originalFrames.length - 1;
  const retainedFrames = originalFrames.filter((frame, index) => index === 0 || index === lastFrameIndex || hasObjectKeyAtTime(project, frame.time));
  if (retainedFrames.length === originalFrames.length) return;

  const currentSeconds = parseTimelineSeconds(project.timeline.currentTime);
  const fallbackFrame =
    originalFrames.reduce((nearest, frame) => {
      const nearestDistance = Math.abs(parseTimelineSeconds(nearest.time) - currentSeconds);
      const frameDistance = Math.abs(parseTimelineSeconds(frame.time) - currentSeconds);
      return frameDistance < nearestDistance ? frame : nearest;
    }, originalFrames[0]) ?? originalFrames[0];
  const nextFrames = retainedFrames.length > 0 ? retainedFrames : [fallbackFrame];
  project.timeline.frames = nextFrames.map((frame, index) => ({ ...frame, order: index + 1 }));

  if (!project.timeline.frames.some((frame) => isSameTime(frame.time, project.timeline.currentTime))) {
    const nextCurrent =
      project.timeline.frames.reduce((nearest, frame) => {
        const nearestDistance = Math.abs(parseTimelineSeconds(nearest.time) - currentSeconds);
        const frameDistance = Math.abs(parseTimelineSeconds(frame.time) - currentSeconds);
        return frameDistance < nearestDistance ? frame : nearest;
      }, project.timeline.frames[0]) ?? project.timeline.frames[0];
    project.timeline.currentTime = nextCurrent.time;
  }

  const frameSeconds = project.timeline.frames.map((frame) => parseTimelineSeconds(frame.time));
  const currentStartSeconds = parseTimelineSeconds(project.timeline.start);
  const currentEndSeconds = parseTimelineSeconds(project.timeline.end);
  project.timeline.start = Math.min(...frameSeconds, Number.isFinite(currentStartSeconds) ? currentStartSeconds : 0).toFixed(1);
  project.timeline.end = Math.max(...frameSeconds, Number.isFinite(currentEndSeconds) ? currentEndSeconds : 0).toFixed(1);
}

function normalizeTimedEntries<T extends TimedEntry>(entries: T[] | undefined): T[] {
  if (!entries) return [];
  const result: T[] = [];

  for (const entry of [...entries].sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time))) {
    const existing = result.find((candidate) => isSameTime(candidate.time, entry.time));
    if (existing) {
      Object.assign(existing, entry);
      existing.displayDate ||= formatTimelineLabel(existing.time);
    } else {
      result.push({
        ...entry,
        displayDate: entry.displayDate || formatTimelineLabel(entry.time),
      });
    }
  }

  return result.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
}

function normalizeTimelineFrames(project: ProjectData) {
  const result: ProjectData["timeline"]["frames"] = [];

  for (const frame of sortedFrames(project.timeline.frames ?? [])) {
    const seconds = parseTimelineSeconds(frame.time);
    const normalizedTime = Number.isFinite(seconds) ? seconds.toFixed(1) : frame.time;
    const existing = result.find((candidate) => isSameTime(candidate.time, normalizedTime));
    if (existing) {
      existing.displayDate = frame.displayDate || existing.displayDate || formatTimelineLabel(normalizedTime);
      existing.memo = frame.memo || existing.memo;
      existing.time = normalizedTime;
    } else {
      result.push({
        ...frame,
        time: normalizedTime,
        displayDate: frame.displayDate || formatTimelineLabel(normalizedTime),
      });
    }
  }

  project.timeline.frames = sortedFrames(result).map((frame, index) => ({ ...frame, order: index + 1 }));
}

function normalizeProjectTiming(project: ProjectData) {
  normalizeTimelineFrames(project);
  project.timeline.interpolationMode = "linear";

  for (const unit of project.units ?? []) {
    unit.shape = unit.shape === "rectangle" || unit.shape === "convex" ? unit.shape : "pentagon";
    for (const keyframe of unit.keyframes ?? []) {
      keyframe.rotation = Number.isFinite(keyframe.rotation) ? keyframe.rotation : 0;
    }
    const explicitSizes = (unit.keyframes ?? []).filter((keyframe) => keyframe.size !== undefined).map((keyframe) => keyframe.size);
    if (explicitSizes.length > 0 && explicitSizes.every((size) => Math.abs((size ?? unit.size) - unit.size) < 0.0001)) {
      for (const keyframe of unit.keyframes ?? []) delete keyframe.size;
    }
    unit.keyframes = normalizeTimedEntries(unit.keyframes);
  }

  for (const site of project.sites ?? []) {
    site.keyframes = normalizeTimedEntries(site.keyframes);
  }

  for (const line of project.lines ?? []) {
    line.keyframes = normalizeTimedEntries(line.keyframes);
  }

  for (const region of project.regions ?? []) {
    region.keyframes = normalizeTimedEntries(region.keyframes);
  }

  for (const arrow of project.arrows ?? []) {
    arrow.keyframes = normalizeTimedEntries(arrow.keyframes);
  }
}

function ensureTimelineFrame(project: ProjectData, time: string) {
  const seconds = parseTimelineSeconds(time);
  const normalizedTime = Number.isFinite(seconds) ? seconds.toFixed(1) : time;
  const existing = project.timeline.frames.find((frame) => isSameTime(frame.time, normalizedTime));
  if (existing) {
    project.timeline.currentTime = existing.time;
    return existing;
  }

  const frame = {
    id: createId("frame"),
    time: normalizedTime,
    displayDate: formatTimelineLabel(normalizedTime),
    order: project.timeline.frames.length + 1,
    memo: "",
  };

  project.timeline.frames.push(frame);
  project.timeline.currentTime = normalizedTime;
  project.timeline.frames = sortedFrames(project.timeline.frames).map((entry, index) => ({ ...entry, order: index + 1 }));
  const frameSeconds = project.timeline.frames.map((entry) => parseTimelineSeconds(entry.time));
  project.timeline.start = Math.min(...frameSeconds, parseTimelineSeconds(project.timeline.start)).toFixed(1);
  project.timeline.end = Math.max(...frameSeconds, parseTimelineSeconds(project.timeline.end)).toFixed(1);

  return frame;
}

function normalizeImportedProject(project: ProjectData): ProjectData {
  const normalized = cloneProject(project);
  normalized.version ||= "1.0.0";
  normalized.map ||= { outputWidth: 1920, outputHeight: 1080 };
  normalized.map.outputWidth ||= 1920;
  normalized.map.outputHeight ||= 1080;
  normalized.map.width ||= 1600;
  normalized.map.height ||= 900;
  normalized.cameraLegend = {
    showFactions: normalized.cameraLegend?.showFactions ?? true,
    factionSize: clampLegendSize(normalized.cameraLegend?.factionSize, 1),
    position: normalized.cameraLegend?.position ?? "top-left",
    backgroundEnabled: normalized.cameraLegend?.backgroundEnabled ?? false,
    backgroundColor: normalized.cameraLegend?.backgroundColor || "#111827",
    backgroundOpacity: clampOpacity(normalized.cameraLegend?.backgroundOpacity, 0.65),
    textBold: normalized.cameraLegend?.textBold ?? true,
  };
  normalizeExportCamera(normalized);
  normalizeMapImages(normalized);
  normalized.factions ||= [];
  for (const faction of normalized.factions) {
    removeLegacyAbbrevName(faction);
    delete (faction as { type?: unknown }).type;
    faction.showInCameraLegend = faction.showInCameraLegend ?? false;
    faction.cameraLegendTextOutlineColor ||= "#111827";
  }
  normalized.regions ||= [];
  for (const [index, region] of normalized.regions.entries()) {
    region.name ||= "領域";
    region.factionId ||= normalized.factions?.[0]?.id ?? "faction_default_a";
    region.points = (region.points ?? []).map(clampPoint);
    const fallbackTime = region.displayStartTime ?? normalized.timeline?.currentTime ?? normalized.timeline?.start ?? "0";
    const fallbackFrame = getCurrentFrame(normalized.timeline?.frames ?? [], fallbackTime);
    const fallbackDisplayDate = fallbackFrame?.displayDate ?? formatTimelineLabel(fallbackTime);
    const normalizedKeyframes = (region.keyframes ?? [])
      .filter((keyframe) => (keyframe.points ?? []).length >= 3)
      .map(
        (keyframe): RegionKeyframe => ({
          time: keyframe.time || fallbackTime,
          displayDate: keyframe.displayDate || formatTimelineLabel(keyframe.time || fallbackTime),
          points: keyframe.points.map(clampPoint),
        }),
      );
    if (normalizedKeyframes.length === 0 && region.points.length >= 3) {
      normalizedKeyframes.push({
        time: fallbackTime,
        displayDate: fallbackDisplayDate,
        points: region.points.map(clampPoint),
      });
    }
    normalizedKeyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
    region.keyframes = normalizedKeyframes;
    region.points = (normalizedKeyframes[normalizedKeyframes.length - 1]?.points ?? region.points).map(clampPoint);
    region.fillColor ||= normalized.factions.find((faction) => faction.id === region.factionId)?.color ?? "#2f7ed8";
    region.useFactionColor = region.useFactionColor ?? true;
    region.opacity = Math.min(1, Math.max(0.05, Number.isFinite(region.opacity) ? region.opacity : 0.35));
    region.displayOrder = Number.isFinite(region.displayOrder) ? region.displayOrder : index;
    region.borderEnabled = region.borderEnabled ?? false;
    region.borderColor ||= "#f8fafc";
    region.borderWidth = Math.min(12, Math.max(0, Number.isFinite(region.borderWidth) ? region.borderWidth : 1));
    region.showName = region.showName ?? false;
    region.nameBold = region.nameBold ?? true;
    region.locked = region.locked ?? false;
    region.memo ??= "";
  }
  normalized.unitAssets ||= [];
  for (const asset of normalized.unitAssets) {
    removeLegacyAbbrevName(asset);
    asset.name ??= "コマ";
    asset.size ||= 1;
    asset.factionId ||= normalized.factions?.[0]?.id ?? "faction_default_a";
    asset.shape = asset.shape === "rectangle" || asset.shape === "convex" ? asset.shape : "pentagon";
    asset.borderColor ||= "#1b1f29";
    asset.rotation = Number.isFinite(asset.rotation) ? asset.rotation : 0;
    asset.showName = asset.showName ?? true;
    asset.nameFontSize ||= 14 * asset.size;
    asset.nameTextColor ||= "#f5efe3";
    asset.nameBold = asset.nameBold ?? true;
    asset.nameBackgroundEnabled = asset.nameBackgroundEnabled ?? false;
    asset.nameBackgroundColor ||= "#111827";
    asset.nameOutlineEnabled = asset.nameOutlineEnabled ?? false;
    asset.nameOutlineColor ||= "#111827";
  }
  normalized.siteAssets ||= [];
  for (const asset of normalized.siteAssets) {
    asset.name ??= "画像拠点";
    asset.size ||= 1;
    asset.factionId ||= normalized.factions?.[0]?.id ?? "faction_default_a";
    asset.nameFontSize ||= 14 * asset.size;
    asset.nameTextColor ||= "#f5efe3";
    asset.nameBold = asset.nameBold ?? false;
    asset.nameBackgroundEnabled = asset.nameBackgroundEnabled ?? false;
    asset.nameBackgroundColor ||= "#111827";
    asset.nameOutlineEnabled = asset.nameOutlineEnabled ?? false;
    asset.nameOutlineColor ||= "#111827";
  }
  normalized.imageAssets ||= [];
  for (const asset of normalized.imageAssets) {
    asset.name ??= "画像";
    asset.size ||= 1;
  }
  for (const site of normalized.sites ?? []) {
    site.size ||= 1;
    site.nameFontSize ||= 14 * site.size;
    site.showName = site.showName ?? true;
    site.nameTextColor ||= "#f5efe3";
    site.nameBold = site.nameBold ?? false;
    site.nameBackgroundEnabled = site.nameBackgroundEnabled ?? false;
    site.nameBackgroundColor ||= "#111827";
    site.nameOutlineEnabled = site.nameOutlineEnabled ?? false;
    site.nameOutlineColor ||= "#111827";
    site.keyframes ||= [];
  }
  normalized.images ||= [];
  for (const [index, image] of normalized.images.entries()) {
    image.name ??= "画像";
    image.size ||= 1;
    image.displayOrder = placedImageDisplayOrder(image, index);
    image.locked = image.locked ?? false;
    image.memo ||= "";
    image.x = Number.isFinite(image.x) ? image.x : image.keyframes?.[0]?.x ?? 0.5;
    image.y = Number.isFinite(image.y) ? image.y : image.keyframes?.[0]?.y ?? 0.5;
    image.keyframes ||= [
      {
        time: normalized.timeline.currentTime || normalized.timeline.start || "0",
        displayDate: formatTimelineLabel(normalized.timeline.currentTime || normalized.timeline.start || "0"),
        x: image.x,
        y: image.y,
      },
    ];
  }
  normalized.images = normalizePlacedImageDisplayOrder(normalized.images);
  for (const arrow of normalized.arrows ?? []) {
    arrow.curveMode ||= "straight";
    arrow.hideWhenRoute = arrow.hideWhenRoute ?? false;
    arrow.outlineEnabled = arrow.outlineEnabled ?? false;
    arrow.outlineColor ||= "#111827";
    arrow.outlineWidth = Math.min(24, Math.max(0, Number.isFinite(arrow.outlineWidth) ? arrow.outlineWidth ?? 4 : 4));
    arrow.revealAlongPath = arrow.revealAlongPath ?? false;
    arrow.revealDurationSeconds = Math.max(0.1, Number.isFinite(arrow.revealDurationSeconds) ? arrow.revealDurationSeconds ?? 1 : 1);
    arrow.arrowHeadSize ||= 1;
    arrow.startTime ||= normalized.timeline.start || normalized.timeline.currentTime || "0";
    arrow.endTime ||= normalized.timeline.end || arrow.startTime;
    if (!arrow.keyframes || arrow.keyframes.length === 0) {
      arrow.keyframes = [
        {
          time: arrow.startTime || normalized.timeline.currentTime || "0",
          displayDate: formatTimelineLabel(arrow.startTime || normalized.timeline.currentTime || "0"),
          points: (arrow.points ?? []).map((point) => ({ ...point })),
          sourceNote: arrow.sourceNote ?? "",
        },
      ];
    }
  }
  for (const line of normalized.lines ?? []) {
    line.curveMode ||= "straight";
    line.hideWhenRoute = line.hideWhenRoute ?? false;
    line.outlineEnabled = line.outlineEnabled ?? false;
    line.outlineColor ||= "#111827";
    line.outlineWidth = Math.min(24, Math.max(0, Number.isFinite(line.outlineWidth) ? line.outlineWidth ?? 4 : 4));
    line.displayStartTime ||= line.keyframes?.[0]?.time ?? normalized.timeline.start ?? "0";
    line.displayEndTime ||= normalized.timeline.end ?? line.displayStartTime;
  }
  for (const unit of normalized.units ?? []) {
    removeLegacyAbbrevName(unit);
    unit.borderColor ||= "#1b1f29";
    unit.nameTextColor ||= "#f5efe3";
    unit.nameBold = unit.nameBold ?? true;
    unit.nameBackgroundEnabled = unit.nameBackgroundEnabled ?? false;
    unit.nameBackgroundColor ||= "#111827";
    unit.nameOutlineEnabled = unit.nameOutlineEnabled ?? false;
    unit.nameOutlineColor ||= "#111827";
    if (unit.route) {
      unit.route = normalizeUnitRoute(normalized, {
        ...unit.route,
        startTime: unit.route.startTime || unit.displayStartTime || unit.keyframes?.[0]?.time || normalized.timeline.start || "0",
        endTime: unit.route.endTime || unit.displayEndTime || normalized.timeline.end || unit.route.startTime || "0",
        direction: unit.route.direction || "forward",
      });
    }
  }
  for (const label of normalized.labels ?? []) {
    label.x = Number.isFinite(label.x) ? label.x : label.keyframes?.[0]?.x ?? 0.5;
    label.y = Number.isFinite(label.y) ? label.y : label.keyframes?.[0]?.y ?? 0.5;
    label.backgroundEnabled = label.backgroundEnabled ?? true;
    label.borderEnabled = label.borderEnabled ?? true;
    label.borderColor ||= "#f0c665";
    label.borderWidth = clampLabelBorderWidth(label.borderWidth, 2);
    label.outerBorderEnabled = label.outerBorderEnabled ?? false;
    label.outerBorderColor ||= "#111827";
    label.outerBorderWidth = clampLabelBorderWidth(label.outerBorderWidth, 2);
    label.outlineEnabled = label.outlineEnabled ?? false;
    label.outlineColor ||= "#111827";
    label.bold = label.bold ?? false;
    const fallbackTime = label.startTime ?? normalized.timeline?.currentTime ?? normalized.timeline?.start ?? "0";
    label.keyframes ||= [
      {
        time: fallbackTime,
        displayDate: getCurrentFrame(normalized.timeline.frames, fallbackTime)?.displayDate ?? formatTimelineLabel(fallbackTime),
        x: label.x,
        y: label.y,
      },
    ];
    label.keyframes = normalizeTimedEntries(label.keyframes).map((keyframe) => ({
      ...keyframe,
      x: Number.isFinite(keyframe.x) ? keyframe.x : label.x,
      y: Number.isFinite(keyframe.y) ? keyframe.y : label.y,
    }));
  }
  normalizeProjectTiming(normalized);
  normalized.timeline.currentTime = getCurrentFrame(normalized.timeline.frames, normalized.timeline.currentTime)?.time ?? normalized.timeline.frames[0]?.time ?? normalized.timeline.currentTime ?? "";
  normalized.timeline.start ||= "0";
  normalized.timeline.end ||= normalized.timeline.frames[normalized.timeline.frames.length - 1]?.time || "10";
  return normalized;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: normalizeImportedProject(sampleProjects[0] ?? emptyProject),
  selected: { type: null, id: null },
  selectedRegionPointIndices: [],
  selectedLinePointIndices: [],
  selectedArrowPointIndices: [],
  routePreviewUnitId: null,
  unitPlacementAssetId: null,
  sitePlacementAssetId: null,
  imagePlacementAssetId: null,
  imagePlacement: null,
  tool: "select",
  drawingPoints: [],
  canvasView: defaultCanvasView,
  historyPast: [],
  historyFuture: [],

  createNewProject: () => {
    const previous = get().project;
    set({
      project: normalizeImportedProject(createBlankProject()),
      selected: { type: null, id: null },
      selectedRegionPointIndices: [],
      selectedLinePointIndices: [],
      selectedArrowPointIndices: [],
      routePreviewUnitId: null,
      unitPlacementAssetId: null,
      sitePlacementAssetId: null,
      imagePlacementAssetId: null,
      imagePlacement: null,
      tool: "select",
      drawingPoints: [],
      canvasView: defaultCanvasView,
      historyPast: trimHistory([...get().historyPast, previous]),
      historyFuture: [],
    });
  },

  loadProject: (project) =>
    set({
      project: normalizeImportedProject(project),
      selected: { type: null, id: null },
      selectedRegionPointIndices: [],
      selectedLinePointIndices: [],
      selectedArrowPointIndices: [],
      routePreviewUnitId: null,
      unitPlacementAssetId: null,
      sitePlacementAssetId: null,
      imagePlacementAssetId: null,
      imagePlacement: null,
      tool: "select",
      drawingPoints: [],
      canvasView: defaultCanvasView,
      historyPast: [],
      historyFuture: [],
    }),

  restoreAutoSaveState: (snapshot) =>
    set({
      project: normalizeImportedProject(snapshot.project),
      selected: snapshot.selected ?? { type: null, id: null },
      selectedRegionPointIndices: snapshot.selectedRegionPointIndices ?? [],
      selectedLinePointIndices: snapshot.selectedLinePointIndices ?? [],
      selectedArrowPointIndices: snapshot.selectedArrowPointIndices ?? [],
      routePreviewUnitId: snapshot.routePreviewUnitId ?? null,
      unitPlacementAssetId: snapshot.unitPlacementAssetId ?? null,
      sitePlacementAssetId: snapshot.sitePlacementAssetId ?? null,
      imagePlacementAssetId: snapshot.imagePlacementAssetId ?? null,
      imagePlacement: snapshot.imagePlacement ?? null,
      tool: snapshot.tool ?? "select",
      drawingPoints: snapshot.drawingPoints ?? [],
      canvasView: normalizeCanvasView(snapshot.canvasView),
      historyPast: [],
      historyFuture: [],
    }),

  updateProjectName: (name) =>
    commit(set, get, (project) => {
      project.projectName = name;
    }),

  updateCameraLegend: (patch) =>
    commit(set, get, (project) => {
      project.cameraLegend = {
        showFactions: patch.showFactions ?? project.cameraLegend?.showFactions ?? true,
        factionSize: patch.factionSize !== undefined ? clampLegendSize(patch.factionSize, project.cameraLegend?.factionSize ?? 1) : clampLegendSize(project.cameraLegend?.factionSize, 1),
        position: patch.position ?? project.cameraLegend?.position ?? "top-left",
        backgroundEnabled: patch.backgroundEnabled ?? project.cameraLegend?.backgroundEnabled ?? false,
        backgroundColor: patch.backgroundColor ?? project.cameraLegend?.backgroundColor ?? "#111827",
        backgroundOpacity: patch.backgroundOpacity !== undefined ? clampOpacity(patch.backgroundOpacity, project.cameraLegend?.backgroundOpacity ?? 0.65) : clampOpacity(project.cameraLegend?.backgroundOpacity, 0.65),
        textBold: patch.textBold ?? project.cameraLegend?.textBold ?? true,
      };
    }),

  setCurrentTime: (time) =>
    set((state) => ({
      project: {
        ...state.project,
        timeline: { ...state.project.timeline, currentTime: time },
      },
    })),

  setTimelineEnd: (seconds) => {
    if (!Number.isFinite(seconds)) return;
    commit(set, get, (project) => {
      const previousEndSeconds = parseTimelineSeconds(project.timeline.end);
      const startSeconds = parseTimelineSeconds(project.timeline.start);
      const nextSeconds = Math.max(Number.isFinite(startSeconds) ? startSeconds : 0, 0, seconds);
      const nextTime = nextSeconds.toFixed(1);
      project.timeline.end = nextTime;
      if (parseTimelineSeconds(project.timeline.currentTime) > nextSeconds) {
        project.timeline.currentTime = nextTime;
      }
      extendObjectDisplayEnds(project, previousEndSeconds, nextTime);
    });
  },

  addFaction: () =>
    commit(set, get, (project) => {
      const id = createId("faction");
      project.factions.push({
        id,
        name: "新規陣営",
        color: "#8cbf72",
        showInCameraLegend: false,
        cameraLegendTextOutlineColor: "#111827",
        memo: "",
      });
      get().selectObject("faction", id);
    }),

  updateFaction: (id, patch) => commit(set, get, (project) => applyListPatch(project.factions, id, patch)),

  deleteFaction: (id) => {
    if (get().project.factions.length <= 1) return;
    commit(set, get, (project) => {
      const fallbackFaction = project.factions.find((faction) => faction.id !== id);
      if (!fallbackFaction) return;
      const fallbackId = fallbackFaction.id;

      project.factions = project.factions.filter((faction) => faction.id !== id);
      for (const asset of project.unitAssets ?? []) {
        if (asset.factionId === id) asset.factionId = fallbackId;
      }
      for (const unit of project.units) {
        if (unit.factionId === id) unit.factionId = fallbackId;
        for (const keyframe of unit.keyframes) {
          if (keyframe.factionId === id) keyframe.factionId = fallbackId;
        }
      }
      for (const site of project.sites) {
        if (site.factionId === id) site.factionId = fallbackId;
        for (const keyframe of site.keyframes ?? []) {
          if (keyframe.factionId === id) keyframe.factionId = fallbackId;
        }
      }
      for (const line of project.lines) {
        if (line.factionId === id) line.factionId = fallbackId;
      }
      for (const arrow of project.arrows) {
        if (arrow.factionId === id) arrow.factionId = fallbackId;
      }
    });
    if (get().selected.type === "faction" && get().selected.id === id) {
      set({ selected: { type: null, id: null } });
    }
  },

  addUnit: (point = { x: 0.5, y: 0.5 }) =>
    commit(set, get, (project) => {
      const frame = currentFrame(project);
      const id = createId("unit");
      const unit: Unit = {
        id,
        name: "新規軍勢",
        factionId: firstFactionId(project),
        unitType: "busho",
        commander: "",
        troopType: "mixed",
        strengthText: "",
        status: "normal",
        certainty: "fictional",
        locked: false,
        size: 1,
        shape: "convex",
        borderColor: "#1b1f29",
        displayStartTime: frame?.time ?? project.timeline.currentTime,
        displayEndTime: project.timeline.end,
        showName: false,
        nameTextColor: "#f5efe3",
        nameBold: true,
        nameBackgroundEnabled: false,
        nameBackgroundColor: "#111827",
        nameOutlineEnabled: false,
        nameOutlineColor: "#111827",
        memo: "",
        sourceNote: "",
        keyframes: [
          {
            time: frame?.time ?? project.timeline.currentTime,
            displayDate: frame?.displayDate ?? formatTimelineLabel(project.timeline.currentTime),
            ...clampPoint(point),
            rotation: 0,
            status: "normal",
            sourceNote: "",
          },
        ],
      };
      project.units.push(unit);
      get().selectObject("unit", id);
    }),

  setUnitImage: (unitId, imageDataUrl) =>
    commit(set, get, (project) => {
      const unit = project.units.find((entry) => entry.id === unitId);
      if (!unit) return;
      unit.iconUrl = imageDataUrl;
      unit.assetId = undefined;
      unit.showName = unit.showName ?? true;
      unit.nameTextColor ||= "#f5efe3";
      unit.nameBold = unit.nameBold ?? true;
      unit.nameBackgroundEnabled = unit.nameBackgroundEnabled ?? false;
      unit.nameBackgroundColor ||= "#111827";
      unit.nameOutlineEnabled = unit.nameOutlineEnabled ?? false;
      unit.nameOutlineColor ||= "#111827";
    }),

  clearUnitImage: (unitId) =>
    commit(set, get, (project) => {
      const unit = project.units.find((entry) => entry.id === unitId);
      if (!unit) return;
      unit.iconUrl = undefined;
      unit.assetId = undefined;
    }),

  registerUnitAsset: (unitId) =>
    commit(set, get, (project) => {
      project.unitAssets ||= [];
      const unit = project.units.find((entry) => entry.id === unitId);
      if (!unit) return;
      const currentFrame = resolveUnitFrame(unit, project.timeline.currentTime, project.timeline.interpolationMode);
      const asset: UnitAsset = {
        id: createId("unit_asset"),
        name: unit.name,
        size: currentFrame?.size ?? unit.size,
        factionId: currentFrame?.effectiveFactionId ?? unit.factionId,
        shape: unit.shape ?? "pentagon",
        borderColor: unit.borderColor ?? "#1b1f29",
        rotation: currentFrame?.rotation ?? 0,
        showName: unit.showName ?? true,
        nameFontSize: unit.nameFontSize ?? 14 * (currentFrame?.size ?? unit.size),
        nameTextColor: unit.nameTextColor ?? "#f5efe3",
        nameBold: unit.nameBold ?? true,
        nameBackgroundEnabled: unit.nameBackgroundEnabled ?? false,
        nameBackgroundColor: unit.nameBackgroundColor ?? "#111827",
        nameOutlineEnabled: unit.nameOutlineEnabled ?? false,
        nameOutlineColor: unit.nameOutlineColor ?? "#111827",
      };
      if (unit.iconUrl) asset.imageDataUrl = unit.iconUrl;
      project.unitAssets.push(asset);
      unit.assetId = asset.id;
      unit.showName = unit.showName ?? true;
    }),

  duplicateUnitFromAsset: (assetId, placementPoint) =>
    commit(set, get, (project) => {
      project.unitAssets ||= [];
      const asset = project.unitAssets.find((entry) => entry.id === assetId);
      if (!asset) return;
      const frame = currentFrame(project);
      const selected = get().selected;
      let point: MapPoint = placementPoint ? clampPoint(placementPoint) : { x: 0.5, y: 0.5 };
      let rotation = asset.rotation ?? 0;
      if (!placementPoint && selected.type === "unit" && selected.id) {
        const selectedUnit = project.units.find((entry) => entry.id === selected.id);
        const selectedFrame = selectedUnit ? resolveUnitFrame(selectedUnit, project.timeline.currentTime, project.timeline.interpolationMode) : null;
        if (selectedFrame) {
          point = clampPoint({ x: selectedFrame.x + 0.04, y: selectedFrame.y + 0.04 });
          rotation = selectedFrame.rotation;
        }
      }
      const id = createId("unit");
      project.units.push({
        id,
        name: asset.name,
        factionId: project.factions.some((faction) => faction.id === asset.factionId) ? asset.factionId : firstFactionId(project),
        unitType: "busho",
        commander: "",
        troopType: "mixed",
        strengthText: "",
        status: "normal",
        certainty: "confirmed",
        locked: false,
        size: asset.size ?? 1,
        shape: asset.shape ?? "pentagon",
        borderColor: asset.borderColor ?? "#1b1f29",
        displayStartTime: frame?.time ?? project.timeline.currentTime,
        displayEndTime: project.timeline.end,
        assetId: asset.id,
        iconUrl: asset.imageDataUrl,
        showName: asset.showName ?? true,
        nameFontSize: asset.nameFontSize ?? 14 * (asset.size ?? 1),
        nameTextColor: asset.nameTextColor ?? "#f5efe3",
        nameBold: asset.nameBold ?? true,
        nameBackgroundEnabled: asset.nameBackgroundEnabled ?? false,
        nameBackgroundColor: asset.nameBackgroundColor ?? "#111827",
        nameOutlineEnabled: asset.nameOutlineEnabled ?? false,
        nameOutlineColor: asset.nameOutlineColor ?? "#111827",
        memo: "",
        sourceNote: "",
        keyframes: [
          {
            time: frame?.time ?? project.timeline.currentTime,
            displayDate: frame?.displayDate ?? formatTimelineLabel(project.timeline.currentTime),
            ...point,
            rotation,
            status: "normal",
            sourceNote: "",
          },
        ],
      });
      get().selectObject("unit", id);
    }),

  deleteUnitAsset: (assetId) => {
    commit(set, get, (project) => {
      project.unitAssets = (project.unitAssets ?? []).filter((asset) => asset.id !== assetId);
      for (const unit of project.units) {
        if (unit.assetId === assetId) unit.assetId = undefined;
      }
    });
    if (get().unitPlacementAssetId === assetId) set({ unitPlacementAssetId: null });
  },

  updateUnit: (id, patch) => commit(set, get, (project) => applyListPatch(project.units, id, patch)),
  setUnitRoute: (id, route) =>
    commit(set, get, (project) => {
      const unit = project.units.find((entry) => entry.id === id);
      if (!unit) return;
      const previousRoute = unit.route ? structuredClone(unit.route) : undefined;
      if (!route && unit.route && unit.keyframes.length === 0) {
        const routePoint = resolveUnitRoutePoint(unit, project.lines, project.arrows, project.timeline.currentTime, project.timeline.interpolationMode);
        if (routePoint) {
          const frame = ensureTimelineFrame(project, project.timeline.currentTime);
          unit.keyframes.push({
            time: frame.time,
            displayDate: frame.displayDate ?? formatTimelineLabel(frame.time),
            x: routePoint.x,
            y: routePoint.y,
            rotation: 0,
            size: unit.size,
            status: unit.status,
            factionId: unit.factionId,
            certainty: unit.certainty,
            sourceNote: unit.sourceNote,
          });
        }
      }
      unit.route = route ? normalizeUnitRoute(project, route) : undefined;
      revealRouteSourceIfUnused(project, previousRoute);
    }),
  toggleUnitRoutePreview: (id) =>
    set((state) => ({
      routePreviewUnitId: state.routePreviewUnitId === id ? null : id,
    })),
  deleteUnit: (id) =>
    commit(set, get, (project) => {
      const previousRoute = project.units.find((unit) => unit.id === id)?.route;
      project.units = project.units.filter((unit) => unit.id !== id);
      project.arrows = project.arrows.filter((arrow) => arrow.unitId !== id);
      revealRouteSourceIfUnused(project, previousRoute);
    }),

  addSite: (point = { x: 0.5, y: 0.5 }) =>
    commit(set, get, (project) => {
      const id = createId("site");
      project.sites.push({
        id,
        name: "新規拠点",
        ...clampPoint(point),
        factionId: firstFactionId(project),
        status: "normal",
        certainty: "fictional",
        memo: "",
        sourceNote: "",
        locked: false,
        size: 1,
        nameFontSize: 14,
        showName: true,
        nameTextColor: "#f5efe3",
        nameBold: false,
        nameBackgroundEnabled: false,
        nameBackgroundColor: "#111827",
        nameOutlineEnabled: false,
        nameOutlineColor: "#111827",
        keyframes: [],
      });
      get().selectObject("site", id);
    }),

  setSiteImage: (siteId, imageDataUrl) =>
    commit(set, get, (project) => {
      const site = project.sites.find((entry) => entry.id === siteId);
      if (!site) return;
      site.iconUrl = imageDataUrl;
      site.assetId = undefined;
      site.showName = site.showName ?? true;
      site.size ||= 1;
      site.nameFontSize ||= 14 * site.size;
      site.nameTextColor ||= "#f5efe3";
      site.nameBold = site.nameBold ?? false;
      site.nameBackgroundEnabled = site.nameBackgroundEnabled ?? false;
      site.nameBackgroundColor ||= "#111827";
      site.nameOutlineEnabled = site.nameOutlineEnabled ?? false;
      site.nameOutlineColor ||= "#111827";
    }),

  clearSiteImage: (siteId) =>
    commit(set, get, (project) => {
      const site = project.sites.find((entry) => entry.id === siteId);
      if (!site) return;
      site.iconUrl = undefined;
      site.assetId = undefined;
    }),

  registerSiteAsset: (siteId) =>
    commit(set, get, (project) => {
      project.siteAssets ||= [];
      const site = project.sites.find((entry) => entry.id === siteId);
      if (!site) return;
      const siteFrame = resolveSiteFrame(site, project.timeline.currentTime);
      const asset: SiteAsset = {
        id: createId("site_asset"),
        name: site.name.trim() || "拠点",
        size: site.size ?? 1,
        factionId: siteFrame.effectiveFactionId,
        nameFontSize: site.nameFontSize ?? 14,
        nameTextColor: site.nameTextColor ?? "#f5efe3",
        nameBold: site.nameBold ?? false,
        nameBackgroundEnabled: site.nameBackgroundEnabled ?? false,
        nameBackgroundColor: site.nameBackgroundColor ?? "#111827",
        nameOutlineEnabled: site.nameOutlineEnabled ?? false,
        nameOutlineColor: site.nameOutlineColor ?? "#111827",
      };
      if (site.iconUrl) asset.imageDataUrl = site.iconUrl;
      project.siteAssets.push(asset);
      site.assetId = asset.id;
      site.showName = site.showName ?? true;
    }),

  duplicateSiteFromAsset: (assetId, placementPoint) =>
    commit(set, get, (project) => {
      project.siteAssets ||= [];
      const asset = project.siteAssets.find((entry) => entry.id === assetId);
      if (!asset) return;
      const selected = get().selected;
      let point: MapPoint = placementPoint ? clampPoint(placementPoint) : { x: 0.5, y: 0.5 };
      if (!placementPoint && selected.type === "site" && selected.id) {
        const selectedSite = project.sites.find((entry) => entry.id === selected.id);
        if (selectedSite) point = clampPoint({ x: selectedSite.x + 0.04, y: selectedSite.y + 0.04 });
      }
      const id = createId("site");
      project.sites.push({
        id,
        name: asset.name,
        ...point,
        factionId: project.factions.some((faction) => faction.id === asset.factionId) ? asset.factionId : firstFactionId(project),
        status: "normal",
        certainty: "confirmed",
        memo: "",
        sourceNote: "",
        locked: false,
        size: asset.size ?? 1,
        nameFontSize: asset.nameFontSize ?? 14,
        assetId: asset.id,
        iconUrl: asset.imageDataUrl,
        showName: true,
        nameTextColor: asset.nameTextColor ?? "#f5efe3",
        nameBold: asset.nameBold ?? false,
        nameBackgroundEnabled: asset.nameBackgroundEnabled ?? false,
        nameBackgroundColor: asset.nameBackgroundColor ?? "#111827",
        nameOutlineEnabled: asset.nameOutlineEnabled ?? false,
        nameOutlineColor: asset.nameOutlineColor ?? "#111827",
        keyframes: [],
      });
      get().selectObject("site", id);
    }),

  deleteSiteAsset: (assetId) => {
    commit(set, get, (project) => {
      project.siteAssets = (project.siteAssets ?? []).filter((asset) => asset.id !== assetId);
      for (const site of project.sites) {
        if (site.assetId === assetId) site.assetId = undefined;
      }
    });
    if (get().sitePlacementAssetId === assetId) set({ sitePlacementAssetId: null });
  },

  updateSite: (id, patch) => commit(set, get, (project) => applyListPatch(project.sites, id, patch)),
  updateSiteKeyframe: (siteId, time, patch) =>
    commit(set, get, (project) => {
      const site = project.sites.find((entry) => entry.id === siteId);
      if (!site) return;
      const frame = getCurrentFrame(project.timeline.frames, time);
      const targetSeconds = parseTimelineSeconds(time);
      site.keyframes ||= [];
      const existing = site.keyframes.find((entry) => Math.abs(parseTimelineSeconds(entry.time) - targetSeconds) < 0.05);
      const keyframe = {
        time,
        displayDate: frame?.displayDate ?? formatTimelineLabel(time),
        factionId: patch.factionId,
      };
      if (existing) Object.assign(existing, keyframe);
      else site.keyframes.push(keyframe);
      site.factionId = patch.factionId;
      site.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
    }),
  deleteSiteKeyframe: (siteId, time) =>
    commit(set, get, (project) => {
      const site = project.sites.find((entry) => entry.id === siteId);
      if (!site?.keyframes) return;
      const targetSeconds = parseTimelineSeconds(time);
      site.keyframes = site.keyframes.filter((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) >= 0.05);
      site.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
    }),
  deleteSite: (id) => commit(set, get, (project) => (project.sites = project.sites.filter((site) => site.id !== id))),

  addImage: (point = { x: 0.5, y: 0.5 }) =>
    commit(set, get, (project) => {
      const placement = get().imagePlacement;
      if (!placement) return;
      const frame = currentFrame(project);
      const time = frame?.time ?? project.timeline.currentTime;
      const displayDate = frame?.displayDate ?? formatTimelineLabel(time);
      const id = createId("image");
      const position = clampPoint(point);
      project.images ||= [];
      const displayOrder = Math.max(-1, ...project.images.map((image) => placedImageDisplayOrder(image, 0))) + 1;
      project.images.push({
        id,
        name: placement.name.trim() || "画像",
        imageDataUrl: placement.dataUrl,
        naturalWidth: placement.naturalWidth,
        naturalHeight: placement.naturalHeight,
        assetId: placement.assetId,
        size: placement.size ?? 1,
        displayOrder,
        locked: false,
        memo: "",
        ...position,
        keyframes: [
          {
            time,
            displayDate,
            ...position,
          },
        ],
      });
      get().selectObject("image", id);
    }),

  updateImage: (id, patch) => commit(set, get, (project) => applyListPatch(project.images, id, patch)),

  moveImageOrder: (id, direction) =>
    commit(set, get, (project) => {
      const orderedImages = sortPlacedImagesByDisplayOrder(project.images);
      const index = orderedImages.findIndex((image) => image.id === id);
      if (index < 0) return;
      const nextIndex = direction === "up" ? Math.min(orderedImages.length - 1, index + 1) : Math.max(0, index - 1);
      if (index === nextIndex) return;
      [orderedImages[index], orderedImages[nextIndex]] = [orderedImages[nextIndex], orderedImages[index]];
      project.images = normalizePlacedImageDisplayOrder(orderedImages);
    }),

  registerImageAsset: (imageId) =>
    commit(set, get, (project) => {
      project.imageAssets ||= [];
      const image = project.images.find((entry) => entry.id === imageId);
      if (!image) return;
      const asset: ImageAsset = {
        id: createId("image_asset"),
        name: image.name,
        imageDataUrl: image.imageDataUrl,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        size: image.size ?? 1,
      };
      project.imageAssets.push(asset);
      image.assetId = asset.id;
    }),

  deleteImageAsset: (assetId) => {
    commit(set, get, (project) => {
      project.imageAssets = (project.imageAssets ?? []).filter((asset) => asset.id !== assetId);
      for (const image of project.images) {
        if (image.assetId === assetId) image.assetId = undefined;
      }
    });
    if (get().imagePlacementAssetId === assetId) set({ imagePlacementAssetId: null, imagePlacement: null });
  },

  updateImageKeyframe: (imageId, time, keyframe) =>
    commit(set, get, (project) => {
      const image = project.images.find((entry) => entry.id === imageId);
      if (!image) return;
      const resolved = resolvePlacedImageFrame(image, time, project.timeline.interpolationMode);
      applyPlacedImagePositionKeyframe(project, imageId, time, {
        x: keyframe.x ?? resolved.x,
        y: keyframe.y ?? resolved.y,
      });
    }),

  deleteImageKeyframe: (imageId, time) =>
    commit(set, get, (project) => {
      const image = project.images.find((entry) => entry.id === imageId);
      if (!image) return;
      const targetSeconds = parseTimelineSeconds(time);
      const resolvedBeforeDelete = resolvePlacedImageFrame(image, time, project.timeline.interpolationMode);
      image.keyframes = image.keyframes.filter((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) >= 0.05);
      if (image.keyframes.length === 0) {
        image.x = resolvedBeforeDelete.x;
        image.y = resolvedBeforeDelete.y;
      }
      image.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
      cleanupEmptyTimelineFrames(project);
    }),

  deleteImage: (id) => commit(set, get, (project) => (project.images = project.images.filter((image) => image.id !== id))),

  addRegion: (points = []) =>
    commit(set, get, (project) => {
      if (points.length < 3) return;
      const frame = currentFrame(project);
      const frames = sortedFrames(project.timeline.frames);
      const id = createId("region");
      const factionId = firstFactionId(project);
      const faction = project.factions.find((entry) => entry.id === factionId);
      const normalizedPoints = points.map(clampPoint);
      project.regions ||= [];
      const displayOrder = Math.max(-1, ...project.regions.map((region) => (Number.isFinite(region.displayOrder) ? region.displayOrder : 0))) + 1;
      project.regions.push({
        id,
        name: "新規領域",
        factionId,
        points: normalizedPoints,
        fillColor: faction?.color ?? "#2f7ed8",
        useFactionColor: true,
        opacity: 0.35,
        displayOrder,
        borderEnabled: false,
        borderColor: "#f8fafc",
        borderWidth: 1,
        showName: false,
        nameBold: true,
        locked: false,
        displayStartTime: frames[0]?.time ?? project.timeline.currentTime,
        displayEndTime: project.timeline.end,
        memo: "",
        keyframes: [
          {
            time: frame?.time ?? project.timeline.currentTime,
            displayDate: frame?.displayDate ?? formatTimelineLabel(project.timeline.currentTime),
            points: normalizedPoints,
          },
        ],
      });
      get().selectObject("region", id);
    }),

  updateRegion: (id, patch) => commit(set, get, (project) => applyListPatch(project.regions, id, patch)),
  updateRegionPoints: (id, points) =>
    commit(set, get, (project) => {
      applyRegionPointsKeyframe(project, id, project.timeline.currentTime, points);
    }),
  deleteRegionKeyframe: (regionId, time) =>
    commit(set, get, (project) => {
      const region = project.regions.find((entry) => entry.id === regionId);
      if (!region?.keyframes) return;
      const targetSeconds = parseTimelineSeconds(time);
      const resolvedBeforeDelete = resolveRegionKeyframe(region, time, project.timeline.interpolationMode);
      region.keyframes = region.keyframes.filter((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) >= 0.05);
      if (region.keyframes.length === 0 && resolvedBeforeDelete) {
        region.points = resolvedBeforeDelete.points.map(clampPoint);
      } else if (region.keyframes.length > 0) {
        region.points = region.keyframes[region.keyframes.length - 1].points.map(clampPoint);
      }
      region.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
    }),
  deleteRegion: (id) => commit(set, get, (project) => (project.regions = project.regions.filter((region) => region.id !== id))),

  addLine: (points = []) =>
    commit(set, get, (project) => {
      const frame = currentFrame(project);
      const id = createId("line");
      project.lines.push({
        id,
        name: "新規線",
        lineType: "siege_line",
        factionId: firstFactionId(project),
        color: "#e4d08b",
        width: 4,
        opacity: 1,
        dashed: false,
        outlineEnabled: false,
        outlineColor: "#111827",
        outlineWidth: 4,
        curveMode: "straight",
        hideWhenRoute: false,
        locked: false,
        displayStartTime: frame?.time ?? project.timeline.currentTime,
        displayEndTime: project.timeline.end,
        certainty: "fictional",
        memo: "",
        sourceNote: "",
        keyframes: [
          {
            time: frame?.time ?? project.timeline.currentTime,
            displayDate: frame?.displayDate ?? formatTimelineLabel(project.timeline.currentTime),
            points,
            sourceNote: "",
          },
        ],
      });
      get().selectObject("line", id);
    }),

  updateLine: (id, patch) => commit(set, get, (project) => applyListPatch(project.lines, id, patch)),
  updateLineKeyframe: (lineId, time, points) =>
    commit(set, get, (project) => {
      const line = project.lines.find((entry) => entry.id === lineId);
      if (!line) return;
      const frame = getCurrentFrame(project.timeline.frames, time);
      const targetSeconds = parseTimelineSeconds(time);
      const existing = line.keyframes.find((entry) => Math.abs(parseTimelineSeconds(entry.time) - targetSeconds) < 0.05);
      const normalizedPoints = points.map(clampPoint);
      if (existing) {
        existing.points = normalizedPoints;
      } else {
        line.keyframes.push({
          time,
          displayDate: frame?.displayDate ?? formatTimelineLabel(time),
          points: normalizedPoints,
          sourceNote: line.sourceNote,
        });
      }
      line.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
      const routePoints = resolveLineRoutePoints(line, time, project.timeline.interpolationMode) ?? normalizedPoints;
      for (const unit of project.units) {
        for (const segment of routeSegmentRefs(unit.route)) {
          if (segment.sourceType === "line" && segment.sourceId === lineId) {
            segment.fallbackPoints = routePoints.map((point) => ({ ...point }));
          }
        }
        syncRouteRoot(unit.route);
      }
    }),
  deleteLineKeyframe: (lineId, time) =>
    commit(set, get, (project) => {
      const line = project.lines.find((entry) => entry.id === lineId);
      if (!line) return;
      const targetSeconds = parseTimelineSeconds(time);
      const deletedRoutePoints = resolveLineRoutePoints(line, time, project.timeline.interpolationMode);
      if (deletedRoutePoints) {
        for (const unit of project.units) {
          for (const segment of routeSegmentRefs(unit.route)) {
            if (segment.sourceType === "line" && segment.sourceId === lineId) {
              segment.fallbackPoints = deletedRoutePoints.map((point) => ({ ...point }));
            }
          }
          syncRouteRoot(unit.route);
        }
      }
      line.keyframes = line.keyframes.filter((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) >= 0.05);
      line.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
    }),
  deleteLine: (id) =>
    commit(set, get, (project) => {
      project.lines = project.lines.filter((line) => line.id !== id);
      for (const unit of project.units) {
        if (!unit.route) continue;
        const segments = routeSegmentRefs(unit.route).filter((segment) => segment.sourceType !== "line" || segment.sourceId !== id);
        unit.route = segments.length > 0 ? { ...segments[0], segments } : undefined;
      }
    }),

  addArrow: (points = []) =>
    commit(set, get, (project) => {
      const id = createId("arrow");
      project.arrows.push({
        id,
        name: "新規矢印",
        arrowType: "advance",
        factionId: firstFactionId(project),
        color: "#f46f5e",
        width: 5,
        arrowHeadSize: 1,
        opacity: 1,
        dashed: false,
        outlineEnabled: false,
        outlineColor: "#111827",
        outlineWidth: 4,
        curveMode: "straight",
        hideWhenRoute: false,
        revealAlongPath: false,
        revealDurationSeconds: 1,
        startTime: project.timeline.currentTime,
        endTime: project.timeline.end,
        points,
        keyframes: [
          {
            time: project.timeline.currentTime,
            displayDate: formatTimelineLabel(project.timeline.currentTime),
            points,
            sourceNote: "",
          },
        ],
        locked: false,
        certainty: "fictional",
        memo: "",
        sourceNote: "",
      });
      get().selectObject("arrow", id);
    }),

  updateArrow: (id, patch) => commit(set, get, (project) => applyListPatch(project.arrows, id, patch)),
  updateArrowKeyframe: (arrowId, time, points) =>
    commit(set, get, (project) => {
      const arrow = project.arrows.find((entry) => entry.id === arrowId);
      if (!arrow) return;
      const frame = getCurrentFrame(project.timeline.frames, time);
      arrow.keyframes ||= [
        {
          time: arrow.startTime,
          displayDate: formatTimelineLabel(arrow.startTime),
          points: arrow.points.map((point) => ({ ...point })),
          sourceNote: arrow.sourceNote,
        },
      ];
      const existing = arrow.keyframes.find((entry) => entry.time === time);
      const normalizedPoints = points.map(clampPoint);
      if (existing) {
        existing.points = normalizedPoints;
      } else {
        arrow.keyframes.push({
          time,
          displayDate: frame?.displayDate ?? formatTimelineLabel(time),
          points: normalizedPoints,
          sourceNote: arrow.sourceNote,
        });
      }
      arrow.points = normalizedPoints;
      arrow.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
      const routePoints = resolveArrowRoutePoints(arrow, time, project.timeline.interpolationMode) ?? normalizedPoints;
      for (const unit of project.units) {
        for (const segment of routeSegmentRefs(unit.route)) {
          if (segment.sourceType === "arrow" && segment.sourceId === arrowId) {
            segment.fallbackPoints = routePoints.map((point) => ({ ...point }));
          }
        }
        syncRouteRoot(unit.route);
      }
    }),
  deleteArrowKeyframe: (arrowId, time) =>
    commit(set, get, (project) => {
      const arrow = project.arrows.find((entry) => entry.id === arrowId);
      if (!arrow?.keyframes) return;
      const targetSeconds = parseTimelineSeconds(time);
      const deletedRoutePoints = resolveArrowRoutePoints(arrow, time, project.timeline.interpolationMode);
      if (deletedRoutePoints) {
        for (const unit of project.units) {
          for (const segment of routeSegmentRefs(unit.route)) {
            if (segment.sourceType === "arrow" && segment.sourceId === arrowId) {
              segment.fallbackPoints = deletedRoutePoints.map((point) => ({ ...point }));
            }
          }
          syncRouteRoot(unit.route);
        }
      }
      arrow.keyframes = arrow.keyframes.filter((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) >= 0.05);
      arrow.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
    }),
  deleteArrow: (id) =>
    commit(set, get, (project) => {
      project.arrows = project.arrows.filter((arrow) => arrow.id !== id);
      for (const unit of project.units) {
        if (!unit.route) continue;
        const segments = routeSegmentRefs(unit.route).filter((segment) => segment.sourceType !== "arrow" || segment.sourceId !== id);
        unit.route = segments.length > 0 ? { ...segments[0], segments } : undefined;
      }
    }),

  addEvent: (point = { x: 0.5, y: 0.5 }) =>
    commit(set, get, (project) => {
      const frame = currentFrame(project);
      const id = createId("event");
      project.events.push({
        id,
        eventType: "other",
        title: "新規イベント",
        time: frame?.time ?? project.timeline.currentTime,
        displayDate: frame?.displayDate ?? formatTimelineLabel(project.timeline.currentTime),
        ...clampPoint(point),
        description: "",
        certainty: "fictional",
        memo: "",
        sourceNote: "",
      });
      get().selectObject("event", id);
    }),

  updateEvent: (id, patch) => commit(set, get, (project) => applyListPatch(project.events, id, patch)),
  deleteEvent: (id) => commit(set, get, (project) => (project.events = project.events.filter((event) => event.id !== id))),

  addLabel: (point = { x: 0.5, y: 0.5 }) =>
    commit(set, get, (project) => {
      const id = createId("label");
      const frame = currentFrame(project);
      const time = frame?.time ?? project.timeline.currentTime;
      const displayDate = frame?.displayDate ?? formatTimelineLabel(time);
      const position = clampPoint(point);
      project.labels.push({
        id,
        text: "注釈",
        ...position,
        fontSize: 24,
        color: "#fff7e6",
        backgroundEnabled: true,
        backgroundColor: "#111827",
        outlineEnabled: false,
        outlineColor: "#111827",
        borderEnabled: true,
        borderColor: "#f0c665",
        borderWidth: 2,
        outerBorderEnabled: false,
        outerBorderColor: "#111827",
        outerBorderWidth: 2,
        bold: false,
        opacity: 0.9,
        locked: false,
        memo: "",
        keyframes: [
          {
            time,
            displayDate,
            ...position,
          },
        ],
      });
      get().selectObject("label", id);
    }),

  updateLabel: (id, patch) => commit(set, get, (project) => applyListPatch(project.labels, id, patch)),
  updateLabelKeyframe: (labelId, time, keyframe) =>
    commit(set, get, (project) => {
      const label = project.labels.find((entry) => entry.id === labelId);
      if (!label) return;
      const resolved = resolveLabelFrame(label, time, project.timeline.interpolationMode);
      applyLabelPositionKeyframe(project, labelId, time, {
        x: keyframe.x ?? resolved.x,
        y: keyframe.y ?? resolved.y,
      });
    }),
  deleteLabelKeyframe: (labelId, time) =>
    commit(set, get, (project) => {
      const label = project.labels.find((entry) => entry.id === labelId);
      if (!label?.keyframes) return;
      const targetSeconds = parseTimelineSeconds(time);
      const resolvedBeforeDelete = resolveLabelFrame(label, time, project.timeline.interpolationMode);
      label.keyframes = label.keyframes.filter((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) >= 0.05);
      if (label.keyframes.length === 0) {
        label.x = resolvedBeforeDelete.x;
        label.y = resolvedBeforeDelete.y;
      }
      label.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
      cleanupEmptyTimelineFrames(project);
    }),
  deleteLabel: (id) => commit(set, get, (project) => (project.labels = project.labels.filter((label) => label.id !== id))),
  moveSelectionItems: (updates) =>
    commit(set, get, (project) => {
      for (const update of updates) {
        if (update.type === "unit") {
          applyUnitPositionKeyframe(project, update.id, project.timeline.currentTime, { x: update.x, y: update.y });
        } else if (update.type === "site") {
          const site = project.sites.find((entry) => entry.id === update.id);
          if (site && !site.locked) Object.assign(site, clampPoint({ x: update.x, y: update.y }));
        } else if (update.type === "image") {
          const image = project.images.find((entry) => entry.id === update.id);
          if (image && !image.locked) applyPlacedImagePositionKeyframe(project, update.id, project.timeline.currentTime, { x: update.x, y: update.y });
        } else if (update.type === "region") {
          const region = project.regions.find((entry) => entry.id === update.id);
          if (region && !region.locked) applyRegionPointsKeyframe(project, update.id, project.timeline.currentTime, update.points);
        } else if (update.type === "label") {
          const label = project.labels.find((entry) => entry.id === update.id);
          if (label && !label.locked) applyLabelPositionKeyframe(project, update.id, project.timeline.currentTime, { x: update.x, y: update.y });
        } else if (update.type === "line") {
          const line = project.lines.find((entry) => entry.id === update.id);
          if (line && !line.locked) applyLinePointsKeyframe(project, update.id, project.timeline.currentTime, update.points);
        } else {
          const arrow = project.arrows.find((entry) => entry.id === update.id);
          if (arrow && !arrow.locked) applyArrowPointsKeyframe(project, update.id, project.timeline.currentTime, update.points);
        }
      }
    }),

  selectObject: (type, id) =>
    set((state) => ({
      tool: state.tool === "mapImageEdit" && type !== "mapImage" ? "select" : state.tool,
      selected: { type, id },
      selectedRegionPointIndices: type === "region" && id === state.selected.id ? state.selectedRegionPointIndices : [],
      selectedLinePointIndices: type === "line" && id === state.selected.id ? state.selectedLinePointIndices : [],
      selectedArrowPointIndices: type === "arrow" && id === state.selected.id ? state.selectedArrowPointIndices : [],
    })),
  toggleRegionPointSelection: (regionId, pointIndex) =>
    set((state) => {
      const current = state.selected.type === "region" && state.selected.id === regionId ? state.selectedRegionPointIndices : [];
      const next = current.includes(pointIndex) ? current.filter((index) => index !== pointIndex) : [...current, pointIndex].slice(-2);
      return {
        selected: { type: "region", id: regionId },
        selectedRegionPointIndices: next,
        selectedLinePointIndices: [],
        selectedArrowPointIndices: [],
      };
    }),
  setRegionPointSelection: (regionId, pointIndices) =>
    set({
      selected: { type: "region", id: regionId },
      selectedRegionPointIndices: [...new Set(pointIndices)].slice(0, 2),
      selectedLinePointIndices: [],
      selectedArrowPointIndices: [],
    }),
  toggleLinePointSelection: (lineId, pointIndex) =>
    set((state) => {
      const current = state.selected.type === "line" && state.selected.id === lineId ? state.selectedLinePointIndices : [];
      const next = current.includes(pointIndex) ? current.filter((index) => index !== pointIndex) : [...current, pointIndex].slice(-2);
      return {
        selected: { type: "line", id: lineId },
        selectedRegionPointIndices: [],
        selectedLinePointIndices: next,
        selectedArrowPointIndices: [],
      };
    }),
  toggleArrowPointSelection: (arrowId, pointIndex) =>
    set((state) => {
      const current = state.selected.type === "arrow" && state.selected.id === arrowId ? state.selectedArrowPointIndices : [];
      const next = current.includes(pointIndex) ? current.filter((index) => index !== pointIndex) : [...current, pointIndex].slice(-2);
      return {
        selected: { type: "arrow", id: arrowId },
        selectedRegionPointIndices: [],
        selectedLinePointIndices: [],
        selectedArrowPointIndices: next,
      };
    }),
  clearRegionPointSelection: () => set({ selectedRegionPointIndices: [] }),
  clearLinePointSelection: () => set({ selectedLinePointIndices: [] }),
  clearArrowPointSelection: () => set({ selectedArrowPointIndices: [] }),
  clearSelection: () => set({ selected: { type: null, id: null }, selectedRegionPointIndices: [], selectedLinePointIndices: [], selectedArrowPointIndices: [] }),

  updateUnitKeyframe: (unitId, time, keyframe) =>
    commit(set, get, (project) => {
      const unit = project.units.find((entry) => entry.id === unitId);
      if (!unit) return;
      const frame = ensureTimelineFrame(project, time);
      const keyframeTime = frame.time;
      const targetSeconds = parseTimelineSeconds(keyframeTime);
      const existing = unit.keyframes.find((entry) => Math.abs(parseTimelineSeconds(entry.time) - targetSeconds) < 0.05);
      const resolved = resolveUnitFrame(unit, keyframeTime, project.timeline.interpolationMode);
      const normalizedPatch: Partial<UnitKeyframe> = {
        ...keyframe,
        ...(keyframe.x !== undefined && keyframe.y !== undefined ? clampPoint({ x: keyframe.x, y: keyframe.y }) : {}),
      };
      const hasSizePatch = normalizedPatch.size !== undefined;

      if (hasSizePatch) {
        const previousFrame = [...sortedFrames(project.timeline.frames)].reverse().find((entry) => parseTimelineSeconds(entry.time) < targetSeconds - 0.0001);
        if (previousFrame) {
          const previousResolved = resolveUnitFrame(unit, previousFrame.time, project.timeline.interpolationMode);
          const previousExisting = unit.keyframes.find((entry) => Math.abs(parseTimelineSeconds(entry.time) - parseTimelineSeconds(previousFrame.time)) < 0.05);
          const previousSize = previousResolved?.size ?? unit.size;

          if (previousExisting) {
            previousExisting.size = previousSize;
          } else {
            unit.keyframes.push({
              time: previousFrame.time,
              displayDate: previousFrame.displayDate ?? formatTimelineLabel(previousFrame.time),
              x: previousResolved?.x ?? resolved?.x ?? 0.5,
              y: previousResolved?.y ?? resolved?.y ?? 0.5,
              rotation: previousResolved?.rotation ?? 0,
              size: previousSize,
              status: previousResolved?.status ?? unit.status,
              factionId: previousResolved?.effectiveFactionId,
              certainty: previousResolved?.effectiveCertainty,
              sourceNote: previousResolved?.sourceNote ?? unit.sourceNote,
            });
          }
        }
      }

      if (existing) {
        Object.assign(existing, normalizedPatch);
      } else {
        const nextKeyframe: UnitKeyframe = {
          time: keyframeTime,
          displayDate: frame.displayDate ?? formatTimelineLabel(keyframeTime),
          x: normalizedPatch.x ?? resolved?.x ?? 0.5,
          y: normalizedPatch.y ?? resolved?.y ?? 0.5,
          rotation: normalizedPatch.rotation ?? resolved?.rotation ?? 0,
          status: normalizedPatch.status ?? unit.status,
          factionId: normalizedPatch.factionId,
          certainty: normalizedPatch.certainty as Certainty | undefined,
          sourceNote: normalizedPatch.sourceNote ?? unit.sourceNote,
        };
        if (hasSizePatch) nextKeyframe.size = normalizedPatch.size;
        unit.keyframes.push(nextKeyframe);
      }
      if (existing) {
        existing.time = keyframeTime;
        existing.displayDate = frame.displayDate ?? formatTimelineLabel(keyframeTime);
      }
      unit.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
    }),

  deleteUnitKeyframe: (unitId, time) =>
    commit(set, get, (project) => {
      const unit = project.units.find((entry) => entry.id === unitId);
      if (!unit) return;
      const targetSeconds = parseTimelineSeconds(time);
      const resolvedBeforeDelete = resolveUnitFrame(unit, time, project.timeline.interpolationMode);
      unit.keyframes = unit.keyframes.filter((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) >= 0.05);
      if (unit.keyframes.length === 0 && resolvedBeforeDelete) {
        unit.x = resolvedBeforeDelete.x;
        unit.y = resolvedBeforeDelete.y;
        unit.rotation = resolvedBeforeDelete.rotation;
        unit.size = resolvedBeforeDelete.size ?? unit.size;
        unit.status = resolvedBeforeDelete.status;
        unit.factionId = resolvedBeforeDelete.effectiveFactionId;
        unit.certainty = resolvedBeforeDelete.effectiveCertainty;
        unit.sourceNote = resolvedBeforeDelete.sourceNote ?? unit.sourceNote;
      }
      unit.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
      const routeRange = getUnitRouteTimeRange(unit.route);
      if (unit.displayStartTime && Math.abs(parseTimelineSeconds(unit.displayStartTime) - targetSeconds) < 0.05) {
        unit.displayStartTime = routeRange?.startTime ?? unit.keyframes[0]?.time ?? unit.displayStartTime;
      }
      if (unit.displayEndTime && Math.abs(parseTimelineSeconds(unit.displayEndTime) - targetSeconds) < 0.05) {
        unit.displayEndTime = routeRange?.endTime ?? unit.keyframes[unit.keyframes.length - 1]?.time ?? unit.displayEndTime;
      }
      cleanupEmptyTimelineFrames(project);
    }),

  setMapImage: (dataUrl, naturalSize, name) => {
    const id = createId("map_image");
    commit(set, get, (project) => {
      project.map.images ||= [];
      const image: CanvasMapImage = {
        id,
        name: name || `\u5730\u56f3\u753b\u50cf${project.map.images.length + 1}`,
        imageDataUrl: dataUrl,
        opacity: 1,
      };
      if (naturalSize && naturalSize.width > 0 && naturalSize.height > 0) {
        image.imageNaturalWidth = naturalSize.width;
        image.imageNaturalHeight = naturalSize.height;
        Object.assign(image, fitImageToMap(project, naturalSize.width, naturalSize.height));
      }
      project.map.images.push(image);
    });
    return id;
  },

  updateMapImagePlacement: (id, patch) =>
    commit(set, get, (project) => {
      const image = project.map.images?.find((entry) => entry.id === id);
      if (!image) return;
      if (patch.name !== undefined) image.name = patch.name;
      if (patch.opacity !== undefined) image.opacity = clampOpacity(patch.opacity, image.opacity ?? 1);
      if (patch.imageX !== undefined) image.imageX = clampPixelValue(patch.imageX, image.imageX ?? 0, -20000, 20000);
      if (patch.imageY !== undefined) image.imageY = clampPixelValue(patch.imageY, image.imageY ?? 0, -20000, 20000);
      if (patch.imageWidth !== undefined) Object.assign(image, resizeMapImageWithAspect(image, patch.imageWidth, "width"));
      else if (patch.imageHeight !== undefined) Object.assign(image, resizeMapImageWithAspect(image, patch.imageHeight, "height"));
    }),

  moveMapImageOrder: (id, direction) =>
    commit(set, get, (project) => {
      const images = project.map.images ?? [];
      const index = images.findIndex((entry) => entry.id === id);
      if (index < 0) return;
      const nextIndex = direction === "up" ? Math.min(images.length - 1, index + 1) : Math.max(0, index - 1);
      if (nextIndex === index) return;
      const [image] = images.splice(index, 1);
      images.splice(nextIndex, 0, image);
    }),

  deleteMapImage: (id) =>
    commit(set, get, (project) => {
      project.map.images = (project.map.images ?? []).filter((image) => image.id !== id);
    }),
  updateExportCamera: (patch) =>
    commit(set, get, (project) => {
      normalizeExportCamera(project);
      const camera = project.map.exportCamera!;
      if (patch.width !== undefined) camera.width = clampPixelValue(patch.width, camera.width, 64, 7680);
      if (patch.height !== undefined) camera.height = clampPixelValue(patch.height, camera.height, 64, 4320);
      if (patch.scale !== undefined) camera.scale = clampCameraScale(patch.scale, camera.scale ?? 1);
      project.map.outputWidth = camera.width;
      project.map.outputHeight = camera.height;
    }),

  updateCameraKeyframe: (time, patch) =>
    commit(set, get, (project) => {
      normalizeExportCamera(project);
      const camera = project.map.exportCamera!;
      const frame = ensureTimelineFrame(project, time);
      const keyframeTime = frame.time;
      const targetSeconds = parseTimelineSeconds(keyframeTime);
      const existing = camera.keyframes.find((entry) => Math.abs(parseTimelineSeconds(entry.time) - targetSeconds) < 0.05);
      const resolved = resolveCameraFrame(camera, keyframeTime, project.timeline.interpolationMode);
      const next: CameraKeyframe = {
        time: keyframeTime,
        displayDate: frame.displayDate ?? formatTimelineLabel(keyframeTime),
        x: patch.x ?? resolved.x,
        y: patch.y ?? resolved.y,
        scale: patch.scale !== undefined ? clampCameraScale(patch.scale, resolved.scale) : resolved.scale,
      };
      if (existing) Object.assign(existing, next);
      else camera.keyframes.push(next);
      camera.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
    }),

  deleteCameraKeyframe: (time) =>
    commit(set, get, (project) => {
      normalizeExportCamera(project);
      const camera = project.map.exportCamera!;
      if (camera.keyframes.length <= 1) return;
      const targetSeconds = parseTimelineSeconds(time);
      camera.keyframes = camera.keyframes.filter((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) >= 0.05);
    }),

  exportProject: () => cloneProject(get().project),
  importProject: (project) => get().loadProject(project),

  setTool: (tool) =>
    set((state) => ({
      tool,
      unitPlacementAssetId: null,
      sitePlacementAssetId: null,
      imagePlacementAssetId: tool === "addImage" ? state.imagePlacementAssetId : null,
      imagePlacement: tool === "addImage" ? state.imagePlacement : null,
      drawingPoints: tool === "drawRegion" || tool === "drawLine" || tool === "drawArrow" ? state.drawingPoints : [],
      selected: tool !== "mapImageEdit" && state.selected.type === "mapImage" ? { type: null, id: null } : state.selected,
    })),
  setUnitPlacementAsset: (assetId) =>
    set({
      tool: "addUnit",
      unitPlacementAssetId: assetId,
      sitePlacementAssetId: null,
      imagePlacementAssetId: null,
      imagePlacement: null,
      drawingPoints: [],
    }),
  setSitePlacementAsset: (assetId) =>
    set({
      tool: "addSite",
      unitPlacementAssetId: null,
      sitePlacementAssetId: assetId,
      imagePlacementAssetId: null,
      imagePlacement: null,
      drawingPoints: [],
    }),
  setImagePlacement: (placement) =>
    set({
      tool: placement ? "addImage" : "select",
      unitPlacementAssetId: null,
      sitePlacementAssetId: null,
      imagePlacementAssetId: placement?.assetId ?? null,
      imagePlacement: placement,
      drawingPoints: [],
    }),
  setImagePlacementAsset: (assetId) =>
    set((state) => {
      const asset = assetId ? state.project.imageAssets.find((entry) => entry.id === assetId) : null;
      return {
        tool: asset ? "addImage" : "select",
        unitPlacementAssetId: null,
        sitePlacementAssetId: null,
        imagePlacementAssetId: asset?.id ?? null,
        imagePlacement: asset
          ? {
              dataUrl: asset.imageDataUrl,
              name: asset.name,
              naturalWidth: asset.naturalWidth,
              naturalHeight: asset.naturalHeight,
              assetId: asset.id,
              size: asset.size,
            }
          : null,
        drawingPoints: [],
      };
    }),
  setCanvasView: (view) =>
    set((state) => {
      const canvasView = normalizeCanvasView({ ...state.canvasView, ...view });
      if (canvasView.x === state.canvasView.x && canvasView.y === state.canvasView.y && canvasView.scale === state.canvasView.scale) return {};
      return { canvasView };
    }),
  addDrawingPoint: (point) => set({ drawingPoints: [...get().drawingPoints, clampPoint(point)] }),
  cancelDrawing: () => set({ drawingPoints: [], tool: "select", unitPlacementAssetId: null, sitePlacementAssetId: null, imagePlacementAssetId: null, imagePlacement: null }),
  finishDrawing: () => {
    const { tool, drawingPoints } = get();
    if ((tool === "drawRegion" && drawingPoints.length < 3) || (tool !== "drawRegion" && drawingPoints.length < 2)) {
      set({ drawingPoints: [], tool: "select" });
      return;
    }
    if (tool === "drawRegion") get().addRegion(drawingPoints);
    if (tool === "drawLine") get().addLine(drawingPoints);
    if (tool === "drawArrow") get().addArrow(drawingPoints);
    set({ drawingPoints: [], tool: "select", imagePlacementAssetId: null, imagePlacement: null });
  },

  deleteSelected: () => {
    const { project, selected, selectedRegionPointIndices, selectedLinePointIndices, selectedArrowPointIndices } = get();
    if (!selected.type || !selected.id) return;

    if (selected.type === "region" && selectedRegionPointIndices.length > 0) {
      const region = project.regions.find((entry) => entry.id === selected.id);
      if (!region || region.locked) return;
      const frame = resolveRegionKeyframe(region, project.timeline.currentTime, project.timeline.interpolationMode);
      if (!frame) return;
      const removeIndices = new Set(selectedRegionPointIndices);
      const nextPoints = frame.points.filter((_, index) => !removeIndices.has(index));
      if (nextPoints.length < 3) return;
      get().updateRegionPoints(selected.id, nextPoints);
      set({ selectedRegionPointIndices: [] });
      return;
    }

    if (selected.type === "line" && selectedLinePointIndices.length > 0) {
      const line = project.lines.find((entry) => entry.id === selected.id);
      const frame = line ? resolveLineKeyframe(line, project.timeline.currentTime, project.timeline.interpolationMode) : null;
      if (!frame) return;
      const removeIndices = new Set(selectedLinePointIndices);
      const nextPoints = frame.points.filter((_, index) => !removeIndices.has(index));
      if (nextPoints.length < 2) return;
      get().updateLineKeyframe(selected.id, project.timeline.currentTime, nextPoints);
      set({ selectedLinePointIndices: [] });
      return;
    }

    if (selected.type === "arrow" && selectedArrowPointIndices.length > 0) {
      const arrow = project.arrows.find((entry) => entry.id === selected.id);
      const frame = arrow ? resolveArrowKeyframe(arrow, project.timeline.currentTime, project.timeline.interpolationMode) : null;
      if (!frame) return;
      const removeIndices = new Set(selectedArrowPointIndices);
      const nextPoints = frame.points.filter((_, index) => !removeIndices.has(index));
      if (nextPoints.length < 2) return;
      get().updateArrowKeyframe(selected.id, project.timeline.currentTime, nextPoints);
      set({ selectedArrowPointIndices: [] });
      return;
    }

    if (selected.type === "unit") get().deleteUnit(selected.id);
    if (selected.type === "site") get().deleteSite(selected.id);
    if (selected.type === "region") get().deleteRegion(selected.id);
    if (selected.type === "line") get().deleteLine(selected.id);
    if (selected.type === "arrow") get().deleteArrow(selected.id);
    if (selected.type === "event") get().deleteEvent(selected.id);
    if (selected.type === "label") get().deleteLabel(selected.id);
    if (selected.type === "image") get().deleteImage(selected.id);
    if (selected.type === "mapImage") get().deleteMapImage(selected.id);
    set({ selected: { type: null, id: null }, selectedRegionPointIndices: [], selectedLinePointIndices: [], selectedArrowPointIndices: [], routePreviewUnitId: null, unitPlacementAssetId: null, sitePlacementAssetId: null, imagePlacementAssetId: null, imagePlacement: null });
  },

  undo: () => {
    const { historyPast, historyFuture, project } = get();
    const previous = historyPast[historyPast.length - 1];
    if (!previous) return;
    set({
      project: previous,
      historyPast: historyPast.slice(0, -1),
      historyFuture: [project, ...historyFuture],
      selected: { type: null, id: null },
      selectedRegionPointIndices: [],
      selectedLinePointIndices: [],
      selectedArrowPointIndices: [],
      routePreviewUnitId: null,
      unitPlacementAssetId: null,
      sitePlacementAssetId: null,
      imagePlacementAssetId: null,
      imagePlacement: null,
    });
  },

  redo: () => {
    const { historyPast, historyFuture, project } = get();
    const next = historyFuture[0];
    if (!next) return;
    set({
      project: next,
      historyPast: trimHistory([...historyPast, project]),
      historyFuture: historyFuture.slice(1),
      selected: { type: null, id: null },
      selectedRegionPointIndices: [],
      selectedLinePointIndices: [],
      selectedArrowPointIndices: [],
      routePreviewUnitId: null,
      unitPlacementAssetId: null,
      sitePlacementAssetId: null,
      imagePlacementAssetId: null,
      imagePlacement: null,
    });
  },
}));
