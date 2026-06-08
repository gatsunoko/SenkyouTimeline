import { create } from "zustand";
import { sampleProjects } from "../data/sampleProjects";
import type {
  BattleArrow,
  BattleEvent,
  BattleLine,
  Certainty,
  Faction,
  MapLabel,
  MapPoint,
  ProjectData,
  SelectionState,
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
import { getUnitRouteSegments, getUnitRouteTimeRange, resolveArrowKeyframe, resolveArrowRoutePoints, resolveLineKeyframe, resolveLineRoutePoints, resolveSiteFrame, resolveUnitFrame, resolveUnitRoutePoint } from "../utils/interpolation";

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
    { id: "faction_default_a", name: "織田・徳川連合", shortName: "織徳", color: "#2f7ed8", type: "alliance", memo: "" },
    { id: "faction_default_b", name: "武田家", shortName: "武田", color: "#c3423f", type: "daimyo", memo: "" },
  ],
  sites: [],
  units: [],
  lines: [],
  arrows: [],
  events: [],
  labels: [],
};

type ProjectMutator = (project: ProjectData) => void;
type TimedEntry = { time: string; displayDate?: string };

interface ProjectStore {
  project: ProjectData;
  selected: SelectionState;
  selectedLinePointIndices: number[];
  selectedArrowPointIndices: number[];
  routePreviewUnitId: string | null;
  tool: ToolMode;
  drawingPoints: MapPoint[];
  historyPast: ProjectData[];
  historyFuture: ProjectData[];
  loadProject: (project: ProjectData) => void;
  loadSample: (index: number) => void;
  setCurrentTime: (time: string) => void;
  moveFrame: (direction: 1 | -1) => void;
  addTimelineKeyframe: () => void;
  updateTimelineFrame: (id: string, patch: { time?: string; displayDate?: string; memo?: string }) => void;
  addFaction: () => void;
  updateFaction: (id: string, patch: Partial<Faction>) => void;
  addUnit: (point?: MapPoint) => void;
  setUnitImage: (unitId: string, imageDataUrl: string) => void;
  registerUnitAsset: (unitId: string) => void;
  duplicateUnitFromAsset: (assetId: string) => void;
  updateUnit: (id: string, patch: Partial<Unit>) => void;
  setUnitRoute: (id: string, route?: UnitRoute) => void;
  toggleUnitRoutePreview: (id: string) => void;
  clearRoutePreview: () => void;
  deleteUnit: (id: string) => void;
  addSite: (point?: MapPoint) => void;
  setSiteImage: (siteId: string, imageDataUrl: string) => void;
  registerSiteAsset: (siteId: string) => void;
  duplicateSiteFromAsset: (assetId: string) => void;
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
  deleteArrow: (id: string) => void;
  addEvent: (point?: MapPoint) => void;
  updateEvent: (id: string, patch: Partial<BattleEvent>) => void;
  deleteEvent: (id: string) => void;
  addLabel: (point?: MapPoint) => void;
  updateLabel: (id: string, patch: Partial<MapLabel>) => void;
  deleteLabel: (id: string) => void;
  selectObject: (type: SelectionState["type"], id: string | null) => void;
  toggleLinePointSelection: (lineId: string, pointIndex: number) => void;
  toggleArrowPointSelection: (arrowId: string, pointIndex: number) => void;
  clearLinePointSelection: () => void;
  clearArrowPointSelection: () => void;
  clearSelection: () => void;
  updateUnitKeyframe: (unitId: string, time: string, keyframe: Partial<UnitKeyframe>) => void;
  deleteUnitKeyframe: (unitId: string, time: string) => void;
  setInterpolationMode: (mode: ProjectData["timeline"]["interpolationMode"]) => void;
  setMapImage: (dataUrl: string) => void;
  setMapSize: (width: number, height: number) => void;
  setMapAreaScale: (scale: number) => void;
  exportProject: () => ProjectData;
  importProject: (project: ProjectData) => void;
  setTool: (tool: ToolMode) => void;
  setDrawingPoints: (points: MapPoint[]) => void;
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
  set({
    project: next,
    historyPast: trimHistory([...get().historyPast, previous]),
    historyFuture: [],
  });
}

function applyListPatch<T extends { id: string }>(items: T[], id: string, patch: Partial<T>) {
  const item = items.find((entry) => entry.id === id);
  if (item) Object.assign(item, patch);
}

function isSameTime(a: string, b: string) {
  return Math.abs(parseTimelineSeconds(a) - parseTimelineSeconds(b)) < 0.05;
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
  normalized.unitAssets ||= [];
  for (const asset of normalized.unitAssets) {
    asset.size ||= 1;
    asset.factionId ||= normalized.factions?.[0]?.id ?? "faction_default_a";
  }
  normalized.siteAssets ||= [];
  for (const asset of normalized.siteAssets) {
    asset.size ||= 1;
    asset.nameFontSize ||= 14 * asset.size;
  }
  for (const site of normalized.sites ?? []) {
    site.size ||= 1;
    site.nameFontSize ||= 14 * site.size;
    site.showName = site.showName ?? true;
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
  normalized.timeline.currentTime = normalized.timeline.currentTime || normalized.timeline.frames[0]?.time || "";
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
  tool: "select",
  drawingPoints: [],
  historyPast: [],
  historyFuture: [],

  loadProject: (project) =>
    set({
      project: normalizeImportedProject(project),
      selected: { type: null, id: null },
      selectedLinePointIndices: [],
      selectedArrowPointIndices: [],
      routePreviewUnitId: null,
      tool: "select",
      drawingPoints: [],
      historyPast: [],
      historyFuture: [],
    }),

  loadSample: (index) => {
    const sample = sampleProjects[index] ?? sampleProjects[0] ?? emptyProject;
    get().loadProject(sample);
  },

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
      const previousEndSeconds = parseTimelineSeconds(project.timeline.end);
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

      if (Math.abs(currentSeconds - previousEndSeconds) < 0.05 && targetSeconds > previousEndSeconds) {
        for (const unit of project.units) {
          if (unit.displayEndTime && Math.abs(parseTimelineSeconds(unit.displayEndTime) - previousEndSeconds) < 0.05) {
            unit.displayEndTime = time;
          }
        }
        for (const line of project.lines) {
          if (line.displayEndTime && Math.abs(parseTimelineSeconds(line.displayEndTime) - previousEndSeconds) < 0.05) {
            line.displayEndTime = time;
          }
        }
        for (const arrow of project.arrows) {
          if (arrow.endTime && Math.abs(parseTimelineSeconds(arrow.endTime) - previousEndSeconds) < 0.05) {
            arrow.endTime = time;
          }
        }
      }

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

    if (createdFrameId && (selectedBefore.type === "frame" || selectedBefore.type === null)) {
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
    }),

  addFaction: () =>
    commit(set, get, (project) => {
      const id = createId("faction");
      project.factions.push({
        id,
        name: "新規陣営",
        shortName: "新軍",
        color: "#8cbf72",
        type: "daimyo",
        memo: "",
      });
      get().selectObject("faction", id);
    }),

  updateFaction: (id, patch) => commit(set, get, (project) => applyListPatch(project.factions, id, patch)),

  addUnit: (point = { x: 0.5, y: 0.5 }) =>
    commit(set, get, (project) => {
      const frame = currentFrame(project);
      const id = createId("unit");
      const unit: Unit = {
        id,
        name: "新規軍勢",
        shortName: "軍勢",
        factionId: firstFactionId(project),
        unitType: "busho",
        commander: "",
        troopType: "mixed",
        strengthText: "",
        status: "normal",
        certainty: "fictional",
        locked: false,
        size: 1,
        displayStartTime: frame?.time ?? project.timeline.currentTime,
        displayEndTime: project.timeline.end,
        showName: true,
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
    }),

  registerUnitAsset: (unitId) =>
    commit(set, get, (project) => {
      project.unitAssets ||= [];
      const unit = project.units.find((entry) => entry.id === unitId);
      if (!unit?.iconUrl) return;
      const name = unit.name.trim() || "画像コマ";
      const currentFrame = resolveUnitFrame(unit, project.timeline.currentTime, project.timeline.interpolationMode);
      const asset: UnitAsset = {
        id: createId("unit_asset"),
        name,
        imageDataUrl: unit.iconUrl,
        size: currentFrame?.size ?? unit.size,
        factionId: unit.factionId,
      };
      project.unitAssets.push(asset);
      unit.assetId = asset.id;
      unit.showName = unit.showName ?? true;
    }),

  duplicateUnitFromAsset: (assetId) =>
    commit(set, get, (project) => {
      project.unitAssets ||= [];
      const asset = project.unitAssets.find((entry) => entry.id === assetId);
      if (!asset) return;
      const frame = currentFrame(project);
      const selected = get().selected;
      let point: MapPoint = { x: 0.5, y: 0.5 };
      if (selected.type === "unit" && selected.id) {
        const selectedUnit = project.units.find((entry) => entry.id === selected.id);
        const selectedFrame = selectedUnit ? resolveUnitFrame(selectedUnit, project.timeline.currentTime, project.timeline.interpolationMode) : null;
        if (selectedFrame) point = clampPoint({ x: selectedFrame.x + 0.04, y: selectedFrame.y + 0.04 });
      }
      const id = createId("unit");
      project.units.push({
        id,
        name: asset.name,
        shortName: asset.name,
        factionId: project.factions.some((faction) => faction.id === asset.factionId) ? asset.factionId : firstFactionId(project),
        unitType: "busho",
        commander: "",
        troopType: "mixed",
        strengthText: "",
        status: "normal",
        certainty: "confirmed",
        locked: false,
        size: asset.size ?? 1,
        displayStartTime: frame?.time ?? project.timeline.currentTime,
        displayEndTime: project.timeline.end,
        assetId: asset.id,
        iconUrl: asset.imageDataUrl,
        showName: true,
        memo: "",
        sourceNote: "",
        keyframes: [
          {
            time: frame?.time ?? project.timeline.currentTime,
            displayDate: frame?.displayDate ?? formatTimelineLabel(project.timeline.currentTime),
            ...point,
            rotation: 0,
            status: "normal",
            sourceNote: "",
          },
        ],
      });
      get().selectObject("unit", id);
    }),

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
  clearRoutePreview: () => set({ routePreviewUnitId: null }),
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
    }),

  registerSiteAsset: (siteId) =>
    commit(set, get, (project) => {
      project.siteAssets ||= [];
      const site = project.sites.find((entry) => entry.id === siteId);
      if (!site?.iconUrl) return;
      const asset: SiteAsset = {
        id: createId("site_asset"),
        name: site.name.trim() || "画像拠点",
        imageDataUrl: site.iconUrl,
        size: site.size ?? 1,
        nameFontSize: site.nameFontSize ?? 14,
      };
      project.siteAssets.push(asset);
      site.assetId = asset.id;
      site.showName = site.showName ?? true;
    }),

  duplicateSiteFromAsset: (assetId) =>
    commit(set, get, (project) => {
      project.siteAssets ||= [];
      const asset = project.siteAssets.find((entry) => entry.id === assetId);
      if (!asset) return;
      const selected = get().selected;
      let point: MapPoint = { x: 0.5, y: 0.5 };
      if (selected.type === "site" && selected.id) {
        const selectedSite = project.sites.find((entry) => entry.id === selected.id);
        if (selectedSite) point = clampPoint({ x: selectedSite.x + 0.04, y: selectedSite.y + 0.04 });
      }
      const id = createId("site");
      project.sites.push({
        id,
        name: asset.name,
        ...point,
        factionId: firstFactionId(project),
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
        keyframes: [],
      });
      get().selectObject("site", id);
    }),

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

  selectObject: (type, id) =>
    set((state) => ({
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
          rotation: normalizedPatch.rotation ?? 0,
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
      unit.keyframes = unit.keyframes.filter((frame) => Math.abs(parseTimelineSeconds(frame.time) - targetSeconds) >= 0.05);
      unit.keyframes.sort((a, b) => parseTimelineSeconds(a.time) - parseTimelineSeconds(b.time));
      const routeRange = getUnitRouteTimeRange(unit.route);
      if (unit.displayStartTime && Math.abs(parseTimelineSeconds(unit.displayStartTime) - targetSeconds) < 0.05) {
        unit.displayStartTime = routeRange?.startTime ?? unit.keyframes[0]?.time ?? unit.displayStartTime;
      }
      if (unit.displayEndTime && Math.abs(parseTimelineSeconds(unit.displayEndTime) - targetSeconds) < 0.05) {
        unit.displayEndTime = routeRange?.endTime ?? unit.keyframes[unit.keyframes.length - 1]?.time ?? unit.displayEndTime;
      }
    }),

  setInterpolationMode: (mode) =>
    commit(set, get, (project) => {
      project.timeline.interpolationMode = mode;
    }),

  setMapImage: (dataUrl) =>
    commit(set, get, (project) => {
      project.map.imageDataUrl = dataUrl;
    }),

  setMapSize: (width, height) =>
    commit(set, get, (project) => {
      project.map.width = Math.round(Math.min(6000, Math.max(320, width)));
      project.map.height = Math.round(Math.min(6000, Math.max(180, height)));
    }),

  setMapAreaScale: (scale) =>
    commit(set, get, (project) => {
      const nextScale = Math.min(3, Math.max(0.5, scale));
      project.map.width = 1600 * nextScale;
      project.map.height = 900 * nextScale;
    }),

  exportProject: () => cloneProject(get().project),
  importProject: (project) => get().loadProject(project),

  setTool: (tool) => set({ tool, drawingPoints: tool === "drawLine" || tool === "drawArrow" ? get().drawingPoints : [] }),
  setDrawingPoints: (points) => set({ drawingPoints: points }),
  addDrawingPoint: (point) => set({ drawingPoints: [...get().drawingPoints, clampPoint(point)] }),
  cancelDrawing: () => set({ drawingPoints: [], tool: "select" }),
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
    set({ selected: { type: null, id: null }, selectedLinePointIndices: [], selectedArrowPointIndices: [], routePreviewUnitId: null });
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
    });
  },
}));
