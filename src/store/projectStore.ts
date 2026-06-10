import { create } from "zustand";
import { sampleProjects } from "../data/sampleProjects";
import type {
  BattleArrow,
  BattleEvent,
  BattleLine,
  CameraKeyframe,
  Certainty,
  ExportCamera,
  Faction,
  MapLabel,
  MapPoint,
  ProjectData,
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
import { clampPoint } from "../utils/coordinate";
import { createId } from "../utils/id";
import { compareTime, formatTimelineLabel, getCurrentFrame, nextFrameTime, parseTimelineSeconds, sortedFrames } from "../utils/time";
import { cloneProject, trimHistory } from "./historyStore";
import { getUnitRouteSegments, getUnitRouteTimeRange, resolveArrowKeyframe, resolveArrowRoutePoints, resolveCameraFrame, resolveLineKeyframe, resolveLineRoutePoints, resolveSiteFrame, resolveUnitFrame, resolveUnitRoutePoint } from "../utils/interpolation";

const emptyProject: ProjectData = {
  version: "1.0.0",
  projectName: "新規戦況図",
  description: "表示確認用のデータ。",
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
  factions: [
    { id: "faction_default_a", name: "織田・徳川連合", color: "#2f7ed8", type: "alliance", memo: "" },
    { id: "faction_default_b", name: "武田家", color: "#c3423f", type: "daimyo", memo: "" },
  ],
  sites: [],
  units: [],
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
    sites: [],
    units: [],
    lines: [],
    arrows: [],
    events: [],
    labels: [],
  };
}

type ProjectMutator = (project: ProjectData) => void;
type TimedEntry = { time: string; displayDate?: string };

interface ProjectStore {
  project: ProjectData;
  selected: SelectionState;
  selectedLinePointIndices: number[];
  selectedArrowPointIndices: number[];
  routePreviewUnitId: string | null;
  unitPlacementAssetId: string | null;
  sitePlacementAssetId: string | null;
  tool: ToolMode;
  drawingPoints: MapPoint[];
  historyPast: ProjectData[];
  historyFuture: ProjectData[];
  createNewProject: () => void;
  loadProject: (project: ProjectData) => void;
  setCurrentTime: (time: string) => void;
  moveFrame: (direction: 1 | -1) => void;
  addTimelineKeyframe: () => void;
  updateTimelineFrame: (id: string, patch: { time?: string; displayDate?: string; memo?: string }) => void;
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
  deleteLabel: (id: string) => void;
  moveSelectionItems: (updates: SelectionMoveUpdate[]) => void;
  selectObject: (type: SelectionState["type"], id: string | null) => void;
  toggleLinePointSelection: (lineId: string, pointIndex: number) => void;
  toggleArrowPointSelection: (arrowId: string, pointIndex: number) => void;
  clearLinePointSelection: () => void;
  clearArrowPointSelection: () => void;
  clearSelection: () => void;
  updateUnitKeyframe: (unitId: string, time: string, keyframe: Partial<UnitKeyframe>) => void;
  deleteUnitKeyframe: (unitId: string, time: string) => void;
  setInterpolationMode: (mode: ProjectData["timeline"]["interpolationMode"]) => void;
  setMapImage: (dataUrl: string, naturalSize?: { width: number; height: number }) => void;
  updateMapImagePlacement: (patch: { imageX?: number; imageY?: number; imageWidth?: number; imageHeight?: number }) => void;
  updateExportCamera: (patch: Partial<Pick<ExportCamera, "width" | "height" | "scale">>) => void;
  updateCameraKeyframe: (time: string, patch: Partial<MapPoint & { scale: number }>) => void;
  deleteCameraKeyframe: (time: string) => void;
  exportProject: () => ProjectData;
  importProject: (project: ProjectData) => void;
  setTool: (tool: ToolMode) => void;
  setUnitPlacementAsset: (assetId: string | null) => void;
  setSitePlacementAsset: (assetId: string | null) => void;
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

function getMapImageAspect(map: ProjectData["map"]) {
  const naturalAspect =
    map.imageNaturalWidth && map.imageNaturalHeight && map.imageNaturalWidth > 0 && map.imageNaturalHeight > 0
      ? map.imageNaturalWidth / map.imageNaturalHeight
      : null;
  if (naturalAspect && Number.isFinite(naturalAspect) && naturalAspect > 0) return naturalAspect;
  const placedAspect = map.imageWidth && map.imageHeight && map.imageWidth > 0 && map.imageHeight > 0 ? map.imageWidth / map.imageHeight : null;
  if (placedAspect && Number.isFinite(placedAspect) && placedAspect > 0) return placedAspect;
  return 16 / 9;
}

function resizeMapImageWithAspect(map: ProjectData["map"], size: number, source: "width" | "height" = "width") {
  const aspect = getMapImageAspect(map);
  if (source === "height") {
    const imageHeight = clampPixelValue(size, map.imageHeight ?? map.height ?? 900, 16, 20000);
    const imageWidth = clampPixelValue(imageHeight * aspect, map.imageWidth ?? map.width ?? 1600, 16, 20000);
    return { imageWidth, imageHeight: clampPixelValue(imageWidth / aspect, imageHeight, 16, 20000) };
  }
  const imageWidth = clampPixelValue(size, map.imageWidth ?? map.width ?? 1600, 16, 20000);
  const imageHeight = clampPixelValue(imageWidth / aspect, map.imageHeight ?? map.height ?? 900, 16, 20000);
  return { imageWidth: clampPixelValue(imageHeight * aspect, imageWidth, 16, 20000), imageHeight };
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
  const selected = currentSelected.type === "frame" && currentSelected.id && !next.timeline.frames.some((frame) => frame.id === currentSelected.id) ? { type: null, id: null } : currentSelected;
  set({
    project: next,
    selected,
    historyPast: trimHistory([...get().historyPast, previous]),
    historyFuture: [],
  });
}

function applyListPatch<T extends { id: string }>(items: T[], id: string, patch: Partial<T>) {
  const item = items.find((entry) => entry.id === id);
  if (item) Object.assign(item, patch);
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

function isSameTime(a: string, b: string) {
  return Math.abs(parseTimelineSeconds(a) - parseTimelineSeconds(b)) < 0.05;
}

function timelineMaxSeconds(project: ProjectData) {
  const frameSeconds = project.timeline.frames.map((frame) => parseTimelineSeconds(frame.time)).filter(Number.isFinite);
  const timelineEndSeconds = parseTimelineSeconds(project.timeline.end);
  if (Number.isFinite(timelineEndSeconds)) frameSeconds.push(timelineEndSeconds);
  return frameSeconds.length > 0 ? Math.max(...frameSeconds) : 0;
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
    project.lines.some((line) => line.keyframes.some((keyframe) => isSameTime(keyframe.time, time))) ||
    project.arrows.some((arrow) => (arrow.keyframes ?? []).some((keyframe) => isSameTime(keyframe.time, time))) ||
    (project.map.exportCamera?.keyframes ?? []).some((keyframe) => isSameTime(keyframe.time, time))
  );
}

function cleanupEmptyTimelineFrames(project: ProjectData) {
  if (project.timeline.frames.length <= 1) return;
  const originalFrames = sortedFrames(project.timeline.frames);
  const keyedFrames = originalFrames.filter((frame) => hasObjectKeyAtTime(project, frame.time));
  if (keyedFrames.length === originalFrames.length) return;

  const currentSeconds = parseTimelineSeconds(project.timeline.currentTime);
  const fallbackFrame =
    originalFrames.reduce((nearest, frame) => {
      const nearestDistance = Math.abs(parseTimelineSeconds(nearest.time) - currentSeconds);
      const frameDistance = Math.abs(parseTimelineSeconds(frame.time) - currentSeconds);
      return frameDistance < nearestDistance ? frame : nearest;
    }, originalFrames[0]) ?? originalFrames[0];
  const nextFrames = keyedFrames.length > 0 ? keyedFrames : [fallbackFrame];
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
  project.timeline.start = Math.min(...frameSeconds).toFixed(1);
  project.timeline.end = Math.max(...frameSeconds).toFixed(1);
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

  for (const unit of project.units ?? []) {
    unit.shape = unit.shape === "pentagon" ? "pentagon" : "rectangle";
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
  normalizeExportCamera(normalized);
  if (normalized.map.imageDataUrl && normalized.map.imageNaturalWidth && normalized.map.imageNaturalHeight && (normalized.map.imageWidth === undefined || normalized.map.imageHeight === undefined)) {
    Object.assign(normalized.map, fitImageToMap(normalized, normalized.map.imageNaturalWidth, normalized.map.imageNaturalHeight));
  } else if (normalized.map.imageDataUrl && normalized.map.imageWidth !== undefined) {
    Object.assign(normalized.map, resizeMapImageWithAspect(normalized.map, normalized.map.imageWidth, "width"));
  }
  normalized.factions ||= [];
  for (const faction of normalized.factions) {
    removeLegacyAbbrevName(faction);
  }
  normalized.unitAssets ||= [];
  for (const asset of normalized.unitAssets) {
    removeLegacyAbbrevName(asset);
    asset.name ??= "コマ";
    asset.size ||= 1;
    asset.factionId ||= normalized.factions?.[0]?.id ?? "faction_default_a";
    asset.shape = asset.shape === "pentagon" ? "pentagon" : "rectangle";
    asset.rotation = Number.isFinite(asset.rotation) ? asset.rotation : 0;
    asset.showName = asset.showName ?? true;
    asset.nameFontSize ||= 14 * asset.size;
    asset.nameTextColor ||= "#f5efe3";
    asset.nameBackgroundEnabled = asset.nameBackgroundEnabled ?? false;
    asset.nameBackgroundColor ||= "#111827";
  }
  normalized.siteAssets ||= [];
  for (const asset of normalized.siteAssets) {
    asset.name ??= "画像拠点";
    asset.size ||= 1;
    asset.factionId ||= normalized.factions?.[0]?.id ?? "faction_default_a";
    asset.nameFontSize ||= 14 * asset.size;
    asset.nameTextColor ||= "#f5efe3";
    asset.nameBackgroundEnabled = asset.nameBackgroundEnabled ?? false;
    asset.nameBackgroundColor ||= "#111827";
  }
  for (const site of normalized.sites ?? []) {
    site.size ||= 1;
    site.nameFontSize ||= 14 * site.size;
    site.showName = site.showName ?? true;
    site.nameTextColor ||= "#f5efe3";
    site.nameBackgroundEnabled = site.nameBackgroundEnabled ?? false;
    site.nameBackgroundColor ||= "#111827";
    site.keyframes ||= [];
  }
  for (const arrow of normalized.arrows ?? []) {
    arrow.curveMode ||= "straight";
    arrow.hideWhenRoute = arrow.hideWhenRoute ?? false;
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
    line.displayStartTime ||= line.keyframes?.[0]?.time ?? normalized.timeline.start ?? "0";
    line.displayEndTime ||= normalized.timeline.end ?? line.displayStartTime;
  }
  for (const unit of normalized.units ?? []) {
    removeLegacyAbbrevName(unit);
    unit.nameTextColor ||= "#f5efe3";
    unit.nameBackgroundEnabled = unit.nameBackgroundEnabled ?? false;
    unit.nameBackgroundColor ||= "#111827";
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
    label.borderColor ||= "#f0c665";
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
  selectedLinePointIndices: [],
  selectedArrowPointIndices: [],
  routePreviewUnitId: null,
  unitPlacementAssetId: null,
  sitePlacementAssetId: null,
  tool: "select",
  drawingPoints: [],
  historyPast: [],
  historyFuture: [],

  createNewProject: () => {
    const previous = get().project;
    set({
      project: normalizeImportedProject(createBlankProject()),
      selected: { type: null, id: null },
      selectedLinePointIndices: [],
      selectedArrowPointIndices: [],
      routePreviewUnitId: null,
      unitPlacementAssetId: null,
      sitePlacementAssetId: null,
      tool: "select",
      drawingPoints: [],
      historyPast: trimHistory([...get().historyPast, previous]),
      historyFuture: [],
    });
  },

  loadProject: (project) =>
    set({
      project: normalizeImportedProject(project),
      selected: { type: null, id: null },
      selectedLinePointIndices: [],
      selectedArrowPointIndices: [],
      routePreviewUnitId: null,
      unitPlacementAssetId: null,
      sitePlacementAssetId: null,
      tool: "select",
      drawingPoints: [],
      historyPast: [],
      historyFuture: [],
    }),

  setCurrentTime: (time) =>
    set((state) => ({
      project: {
        ...state.project,
        timeline: { ...state.project.timeline, currentTime: time },
      },
    })),

  moveFrame: (direction) => {
    const project = get().project;
    get().setCurrentTime(nextFrameTime(project.timeline.frames, project.timeline.currentTime, direction));
  },

  addTimelineKeyframe: () => {
    const selectedBefore = get().selected;
    let createdFrameId: string | null = null;

    commit(set, get, (project) => {
      const currentSeconds = parseTimelineSeconds(project.timeline.currentTime);
      const previousEndSeconds = timelineMaxSeconds(project);
      const hasFrameAtCurrent = project.timeline.frames.some((frame) => Math.abs(parseTimelineSeconds(frame.time) - currentSeconds) < 0.05);
      let targetSeconds = currentSeconds;

      if (hasFrameAtCurrent) {
        targetSeconds = Math.round((currentSeconds + 1) * 10) / 10;
        const hasFrameAtTarget = () => project.timeline.frames.some((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) < 0.05);
        while (hasFrameAtTarget()) targetSeconds = Math.round((targetSeconds + 1) * 10) / 10;
      }

      const time = targetSeconds.toFixed(1);
      createdFrameId = createId("frame");
      project.timeline.frames.push({
        id: createdFrameId,
        time,
        displayDate: formatTimelineLabel(time),
        order: project.timeline.frames.length + 1,
        memo: "",
      });
      project.timeline.frames = sortedFrames(project.timeline.frames).map((frame, index) => ({ ...frame, order: index + 1 }));
      if (parseTimelineSeconds(project.timeline.end) < targetSeconds) project.timeline.end = time;
      project.timeline.currentTime = time;
      extendObjectDisplayEnds(project, previousEndSeconds, time);

      const selected = get().selected;
      if (selected.type === "site" && selected.id) {
        const site = project.sites.find((entry) => entry.id === selected.id);
        if (site) {
          const resolved = resolveSiteFrame(site, time);
          const existing = site.keyframes?.find((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) < 0.05);
          const keyframe = {
            time,
            displayDate: formatTimelineLabel(time),
            factionId: resolved.effectiveFactionId,
          };
          site.keyframes ||= [];
          if (existing) Object.assign(existing, keyframe);
          else site.keyframes.push(keyframe);
          site.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
        }
      }

      if (selected.type === "unit" && selected.id) {
        const unit = project.units.find((entry) => entry.id === selected.id);
        if (unit) {
          const resolved = resolveUnitFrame(unit, time, project.timeline.interpolationMode);
          const existing = unit.keyframes.find((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) < 0.05);
          const keyframe = {
            time,
            displayDate: formatTimelineLabel(time),
            x: resolved?.x ?? 0.5,
            y: resolved?.y ?? 0.5,
            rotation: resolved?.rotation ?? 0,
            status: resolved?.status ?? unit.status,
            factionId: resolved?.effectiveFactionId,
            certainty: resolved?.effectiveCertainty,
            sourceNote: resolved?.sourceNote ?? unit.sourceNote,
          };
          if (existing) Object.assign(existing, keyframe);
          else unit.keyframes.push(keyframe);
          unit.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
        }
      }

      if (selected.type === "line" && selected.id) {
        const line = project.lines.find((entry) => entry.id === selected.id);
        if (line) {
          const resolved = resolveLineKeyframe(line, time, project.timeline.interpolationMode);
          const existing = line.keyframes.find((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) < 0.05);
          const keyframe = {
            time,
            displayDate: formatTimelineLabel(time),
            points: resolved?.points.map((point) => ({ ...point })) ?? [],
            sourceNote: resolved?.sourceNote ?? line.sourceNote,
          };
          if (existing) Object.assign(existing, keyframe);
          else line.keyframes.push(keyframe);
          line.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
        }
      }

      if (selected.type === "arrow" && selected.id) {
        const arrow = project.arrows.find((entry) => entry.id === selected.id);
        if (arrow) {
          arrow.keyframes ||= [
            {
              time: arrow.startTime,
              displayDate: formatTimelineLabel(arrow.startTime),
              points: arrow.points.map((point) => ({ ...point })),
              sourceNote: arrow.sourceNote,
            },
          ];
          const resolved = resolveArrowKeyframe(arrow, time, project.timeline.interpolationMode);
          const existing = arrow.keyframes.find((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) < 0.05);
          const keyframe = {
            time,
            displayDate: formatTimelineLabel(time),
            points: resolved?.points.map((point) => ({ ...point })) ?? arrow.points.map((point) => ({ ...point })),
            sourceNote: resolved?.sourceNote ?? arrow.sourceNote,
          };
          if (existing) Object.assign(existing, keyframe);
          else arrow.keyframes.push(keyframe);
          arrow.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
        }
      }
    });

    if (createdFrameId && get().project.timeline.frames.some((frame) => frame.id === createdFrameId) && (selectedBefore.type === "frame" || selectedBefore.type === null)) {
      get().selectObject("frame", createdFrameId);
    }
  },

  updateTimelineFrame: (id, patch) =>
    commit(set, get, (project) => {
      const frame = project.timeline.frames.find((entry) => entry.id === id);
      if (!frame) return;

      const oldTime = frame.time;
      const oldSeconds = parseTimelineSeconds(oldTime);
      const nextTime = patch.time !== undefined ? Number(parseTimelineSeconds(patch.time)).toFixed(1) : frame.time;
      if (patch.time !== undefined && project.timeline.frames.some((entry) => entry.id !== id && isSameTime(entry.time, nextTime))) {
        return;
      }
      const previousEndSeconds = timelineMaxSeconds(project);

      frame.time = nextTime;
      frame.displayDate = patch.displayDate ?? (patch.time !== undefined ? formatTimelineLabel(nextTime) : frame.displayDate);
      if (patch.memo !== undefined) frame.memo = patch.memo;

      if (patch.time !== undefined && Math.abs(parseTimelineSeconds(nextTime) - oldSeconds) >= 0.05) {
        for (const unit of project.units) {
          if (unit.displayStartTime && Math.abs(parseTimelineSeconds(unit.displayStartTime) - oldSeconds) < 0.05) unit.displayStartTime = nextTime;
          if (unit.displayEndTime && Math.abs(parseTimelineSeconds(unit.displayEndTime) - oldSeconds) < 0.05) unit.displayEndTime = nextTime;
          for (const keyframe of unit.keyframes) {
            if (Math.abs(parseTimelineSeconds(keyframe.time) - oldSeconds) < 0.05) {
              keyframe.time = nextTime;
              keyframe.displayDate = formatTimelineLabel(nextTime);
            }
          }
          unit.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
        }

        for (const line of project.lines) {
          if (line.displayStartTime && Math.abs(parseTimelineSeconds(line.displayStartTime) - oldSeconds) < 0.05) line.displayStartTime = nextTime;
          if (line.displayEndTime && Math.abs(parseTimelineSeconds(line.displayEndTime) - oldSeconds) < 0.05) line.displayEndTime = nextTime;
          for (const keyframe of line.keyframes) {
            if (Math.abs(parseTimelineSeconds(keyframe.time) - oldSeconds) < 0.05) {
              keyframe.time = nextTime;
              keyframe.displayDate = formatTimelineLabel(nextTime);
            }
          }
          line.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
        }

        for (const event of project.events) {
          if (Math.abs(parseTimelineSeconds(event.time) - oldSeconds) < 0.05) {
            event.time = nextTime;
            event.displayDate = formatTimelineLabel(nextTime);
          }
        }

        for (const arrow of project.arrows) {
          if (Math.abs(parseTimelineSeconds(arrow.startTime) - oldSeconds) < 0.05) arrow.startTime = nextTime;
          if (Math.abs(parseTimelineSeconds(arrow.endTime) - oldSeconds) < 0.05) arrow.endTime = nextTime;
          for (const keyframe of arrow.keyframes ?? []) {
            if (Math.abs(parseTimelineSeconds(keyframe.time) - oldSeconds) < 0.05) {
              keyframe.time = nextTime;
              keyframe.displayDate = formatTimelineLabel(nextTime);
            }
          }
          arrow.keyframes?.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
        }

        for (const label of project.labels) {
          if (label.startTime && Math.abs(parseTimelineSeconds(label.startTime) - oldSeconds) < 0.05) label.startTime = nextTime;
          if (label.endTime && Math.abs(parseTimelineSeconds(label.endTime) - oldSeconds) < 0.05) label.endTime = nextTime;
        }

        if (Math.abs(parseTimelineSeconds(project.timeline.currentTime) - oldSeconds) < 0.05) project.timeline.currentTime = nextTime;
        if (Math.abs(parseTimelineSeconds(project.timeline.start) - oldSeconds) < 0.05) project.timeline.start = nextTime;
        if (Math.abs(parseTimelineSeconds(project.timeline.end) - oldSeconds) < 0.05) project.timeline.end = nextTime;
      }

      project.timeline.frames = sortedFrames(project.timeline.frames).map((entry, index) => ({ ...entry, order: index + 1 }));
      const frameSeconds = project.timeline.frames.map((entry) => parseTimelineSeconds(entry.time));
      project.timeline.start = Math.min(...frameSeconds, parseTimelineSeconds(project.timeline.start)).toFixed(1);
      project.timeline.end = Math.max(...frameSeconds, parseTimelineSeconds(project.timeline.end)).toFixed(1);
      if (patch.time !== undefined) extendObjectDisplayEnds(project, previousEndSeconds, project.timeline.end);
    }),

  addFaction: () =>
    commit(set, get, (project) => {
      const id = createId("faction");
      project.factions.push({
        id,
        name: "新規陣営",
        color: "#8cbf72",
        type: "daimyo",
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
        shape: "rectangle",
        displayStartTime: frame?.time ?? project.timeline.currentTime,
        displayEndTime: project.timeline.end,
        showName: true,
        nameTextColor: "#f5efe3",
        nameBackgroundEnabled: false,
        nameBackgroundColor: "#111827",
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
      unit.nameBackgroundEnabled = unit.nameBackgroundEnabled ?? false;
      unit.nameBackgroundColor ||= "#111827";
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
        shape: unit.shape ?? "rectangle",
        rotation: currentFrame?.rotation ?? 0,
        showName: unit.showName ?? true,
        nameFontSize: unit.nameFontSize ?? 14 * (currentFrame?.size ?? unit.size),
        nameTextColor: unit.nameTextColor ?? "#f5efe3",
        nameBackgroundEnabled: unit.nameBackgroundEnabled ?? false,
        nameBackgroundColor: unit.nameBackgroundColor ?? "#111827",
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
        shape: asset.shape ?? "rectangle",
        displayStartTime: frame?.time ?? project.timeline.currentTime,
        displayEndTime: project.timeline.end,
        assetId: asset.id,
        iconUrl: asset.imageDataUrl,
        showName: asset.showName ?? true,
        nameFontSize: asset.nameFontSize ?? 14 * (asset.size ?? 1),
        nameTextColor: asset.nameTextColor ?? "#f5efe3",
        nameBackgroundEnabled: asset.nameBackgroundEnabled ?? false,
        nameBackgroundColor: asset.nameBackgroundColor ?? "#111827",
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
        nameBackgroundEnabled: false,
        nameBackgroundColor: "#111827",
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
      site.nameBackgroundEnabled = site.nameBackgroundEnabled ?? false;
      site.nameBackgroundColor ||= "#111827";
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
      if (!site?.iconUrl) return;
      const siteFrame = resolveSiteFrame(site, project.timeline.currentTime);
      const asset: SiteAsset = {
        id: createId("site_asset"),
        name: site.name.trim() || "画像拠点",
        imageDataUrl: site.iconUrl,
        size: site.size ?? 1,
        factionId: siteFrame.effectiveFactionId,
        nameFontSize: site.nameFontSize ?? 14,
        nameTextColor: site.nameTextColor ?? "#f5efe3",
        nameBackgroundEnabled: site.nameBackgroundEnabled ?? false,
        nameBackgroundColor: site.nameBackgroundColor ?? "#111827",
      };
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
        nameBackgroundEnabled: asset.nameBackgroundEnabled ?? false,
        nameBackgroundColor: asset.nameBackgroundColor ?? "#111827",
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
        opacity: 0.85,
        dashed: false,
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
        opacity: 0.85,
        dashed: false,
        curveMode: "straight",
        hideWhenRoute: false,
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
      project.labels.push({
        id,
        text: "注釈",
        ...clampPoint(point),
        fontSize: 24,
        color: "#fff7e6",
        backgroundColor: "#111827",
        borderColor: "#f0c665",
        opacity: 0.9,
        locked: false,
        memo: "",
      });
      get().selectObject("label", id);
    }),

  updateLabel: (id, patch) => commit(set, get, (project) => applyListPatch(project.labels, id, patch)),
  deleteLabel: (id) => commit(set, get, (project) => (project.labels = project.labels.filter((label) => label.id !== id))),
  moveSelectionItems: (updates) =>
    commit(set, get, (project) => {
      for (const update of updates) {
        if (update.type === "unit") {
          applyUnitPositionKeyframe(project, update.id, project.timeline.currentTime, { x: update.x, y: update.y });
        } else if (update.type === "site") {
          const site = project.sites.find((entry) => entry.id === update.id);
          if (site && !site.locked) Object.assign(site, clampPoint({ x: update.x, y: update.y }));
        } else if (update.type === "label") {
          const label = project.labels.find((entry) => entry.id === update.id);
          if (label && !label.locked) Object.assign(label, clampPoint({ x: update.x, y: update.y }));
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
      selectedLinePointIndices: type === "line" && id === state.selected.id ? state.selectedLinePointIndices : [],
      selectedArrowPointIndices: type === "arrow" && id === state.selected.id ? state.selectedArrowPointIndices : [],
    })),
  toggleLinePointSelection: (lineId, pointIndex) =>
    set((state) => {
      const current = state.selected.type === "line" && state.selected.id === lineId ? state.selectedLinePointIndices : [];
      const next = current.includes(pointIndex) ? current.filter((index) => index !== pointIndex) : [...current, pointIndex].slice(-2);
      return {
        selected: { type: "line", id: lineId },
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
        selectedLinePointIndices: [],
        selectedArrowPointIndices: next,
      };
    }),
  clearLinePointSelection: () => set({ selectedLinePointIndices: [] }),
  clearArrowPointSelection: () => set({ selectedArrowPointIndices: [] }),
  clearSelection: () => set({ selected: { type: null, id: null }, selectedLinePointIndices: [], selectedArrowPointIndices: [] }),

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

  setInterpolationMode: (mode) =>
    commit(set, get, (project) => {
      project.timeline.interpolationMode = mode;
    }),

  setMapImage: (dataUrl, naturalSize) =>
    commit(set, get, (project) => {
      project.map.imageDataUrl = dataUrl;
      if (naturalSize && naturalSize.width > 0 && naturalSize.height > 0) {
        project.map.imageNaturalWidth = naturalSize.width;
        project.map.imageNaturalHeight = naturalSize.height;
        Object.assign(project.map, fitImageToMap(project, naturalSize.width, naturalSize.height));
      }
    }),

  updateMapImagePlacement: (patch) =>
    commit(set, get, (project) => {
      if (!project.map.imageDataUrl) return;
      if (patch.imageX !== undefined) project.map.imageX = clampPixelValue(patch.imageX, project.map.imageX ?? 0, -20000, 20000);
      if (patch.imageY !== undefined) project.map.imageY = clampPixelValue(patch.imageY, project.map.imageY ?? 0, -20000, 20000);
      if (patch.imageWidth !== undefined) Object.assign(project.map, resizeMapImageWithAspect(project.map, patch.imageWidth, "width"));
      else if (patch.imageHeight !== undefined) Object.assign(project.map, resizeMapImageWithAspect(project.map, patch.imageHeight, "height"));
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
      drawingPoints: tool === "drawLine" || tool === "drawArrow" ? state.drawingPoints : [],
      selected: tool !== "mapImageEdit" && state.selected.type === "mapImage" ? { type: null, id: null } : state.selected,
    })),
  setUnitPlacementAsset: (assetId) =>
    set({
      tool: "addUnit",
      unitPlacementAssetId: assetId,
      sitePlacementAssetId: null,
      drawingPoints: [],
    }),
  setSitePlacementAsset: (assetId) =>
    set({
      tool: "addSite",
      unitPlacementAssetId: null,
      sitePlacementAssetId: assetId,
      drawingPoints: [],
    }),
  addDrawingPoint: (point) => set({ drawingPoints: [...get().drawingPoints, clampPoint(point)] }),
  cancelDrawing: () => set({ drawingPoints: [], tool: "select", unitPlacementAssetId: null, sitePlacementAssetId: null }),
  finishDrawing: () => {
    const { tool, drawingPoints } = get();
    if (drawingPoints.length < 2) {
      set({ drawingPoints: [], tool: "select" });
      return;
    }
    if (tool === "drawLine") get().addLine(drawingPoints);
    if (tool === "drawArrow") get().addArrow(drawingPoints);
    set({ drawingPoints: [], tool: "select" });
  },

  deleteSelected: () => {
    const { project, selected, selectedLinePointIndices, selectedArrowPointIndices } = get();
    if (!selected.type || !selected.id) return;

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
    if (selected.type === "line") get().deleteLine(selected.id);
    if (selected.type === "arrow") get().deleteArrow(selected.id);
    if (selected.type === "event") get().deleteEvent(selected.id);
    if (selected.type === "label") get().deleteLabel(selected.id);
    set({ selected: { type: null, id: null }, selectedLinePointIndices: [], selectedArrowPointIndices: [], routePreviewUnitId: null, unitPlacementAssetId: null, sitePlacementAssetId: null });
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
      selectedLinePointIndices: [],
      selectedArrowPointIndices: [],
      routePreviewUnitId: null,
      unitPlacementAssetId: null,
      sitePlacementAssetId: null,
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
      selectedLinePointIndices: [],
      selectedArrowPointIndices: [],
      routePreviewUnitId: null,
      unitPlacementAssetId: null,
      sitePlacementAssetId: null,
    });
  },
}));
