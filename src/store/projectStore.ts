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
  ToolMode,
  Unit,
  UnitKeyframe,
} from "../types/project";
import { clampPoint } from "../utils/coordinate";
import { createId } from "../utils/id";
import { getCurrentFrame, nextFrameTime, sortedFrames } from "../utils/time";
import { cloneProject, trimHistory } from "./historyStore";

const emptyProject: ProjectData = {
  version: "1.0.0",
  projectName: "新規戦況図",
  description: "表示確認用の仮データ。史実確定ではない。",
  timeline: {
    start: "1575-05-19",
    end: "1575-05-21",
    currentTime: "1575-05-19",
    calendarType: "japanese_lunisolar",
    defaultStep: "1d",
    interpolationMode: "linear",
    frames: [
      { id: "frame_1", time: "1575-05-19", displayDate: "天正3年5月19日", order: 1, memo: "" },
      { id: "frame_2", time: "1575-05-20", displayDate: "天正3年5月20日", order: 2, memo: "" },
      { id: "frame_3", time: "1575-05-21", displayDate: "天正3年5月21日", order: 3, memo: "" },
    ],
  },
  map: { outputWidth: 1920, outputHeight: 1080 },
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

interface ProjectStore {
  project: ProjectData;
  selected: SelectionState;
  tool: ToolMode;
  drawingPoints: MapPoint[];
  historyPast: ProjectData[];
  historyFuture: ProjectData[];
  loadProject: (project: ProjectData) => void;
  loadSample: (index: number) => void;
  setCurrentTime: (time: string) => void;
  moveFrame: (direction: 1 | -1) => void;
  addFaction: () => void;
  updateFaction: (id: string, patch: Partial<Faction>) => void;
  addUnit: (point?: MapPoint) => void;
  updateUnit: (id: string, patch: Partial<Unit>) => void;
  deleteUnit: (id: string) => void;
  addSite: (point?: MapPoint) => void;
  updateSite: (id: string, patch: Partial<Site>) => void;
  deleteSite: (id: string) => void;
  addLine: (points?: MapPoint[]) => void;
  updateLine: (id: string, patch: Partial<BattleLine>) => void;
  deleteLine: (id: string) => void;
  addArrow: (points?: MapPoint[]) => void;
  updateArrow: (id: string, patch: Partial<BattleArrow>) => void;
  deleteArrow: (id: string) => void;
  addEvent: (point?: MapPoint) => void;
  updateEvent: (id: string, patch: Partial<BattleEvent>) => void;
  deleteEvent: (id: string) => void;
  addLabel: (point?: MapPoint) => void;
  updateLabel: (id: string, patch: Partial<MapLabel>) => void;
  deleteLabel: (id: string) => void;
  selectObject: (type: SelectionState["type"], id: string | null) => void;
  clearSelection: () => void;
  updateUnitKeyframe: (unitId: string, time: string, keyframe: Partial<UnitKeyframe>) => void;
  deleteUnitKeyframe: (unitId: string, time: string) => void;
  setInterpolationMode: (mode: ProjectData["timeline"]["interpolationMode"]) => void;
  setMapImage: (dataUrl: string) => void;
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

function commit(set: (partial: Partial<ProjectStore>) => void, get: () => ProjectStore, mutator: ProjectMutator) {
  const previous = get().project;
  const next = cloneProject(previous);
  mutator(next);
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

function normalizeImportedProject(project: ProjectData): ProjectData {
  const normalized = cloneProject(project);
  normalized.version ||= "1.0.0";
  normalized.map ||= { outputWidth: 1920, outputHeight: 1080 };
  normalized.map.outputWidth ||= 1920;
  normalized.map.outputHeight ||= 1080;
  normalized.timeline.frames = sortedFrames(normalized.timeline.frames ?? []);
  normalized.timeline.currentTime = normalized.timeline.currentTime || normalized.timeline.frames[0]?.time || "";
  return normalized;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  project: sampleProjects[0] ? cloneProject(sampleProjects[0]) : emptyProject,
  selected: { type: null, id: null },
  tool: "select",
  drawingPoints: [],
  historyPast: [],
  historyFuture: [],

  loadProject: (project) =>
    set({
      project: normalizeImportedProject(project),
      selected: { type: null, id: null },
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
        visible: true,
        locked: false,
        size: 1,
        memo: "表示確認用の仮データ。史実確定ではない。",
        sourceNote: "表示確認用の仮データ。史実確定ではない。",
        keyframes: [
          {
            time: frame?.time ?? project.timeline.currentTime,
            displayDate: frame?.displayDate ?? project.timeline.currentTime,
            ...clampPoint(point),
            rotation: 0,
            visible: true,
            status: "normal",
            sourceNote: "",
          },
        ],
      };
      project.units.push(unit);
      get().selectObject("unit", id);
    }),

  updateUnit: (id, patch) => commit(set, get, (project) => applyListPatch(project.units, id, patch)),
  deleteUnit: (id) =>
    commit(set, get, (project) => {
      project.units = project.units.filter((unit) => unit.id !== id);
      project.arrows = project.arrows.filter((arrow) => arrow.unitId !== id);
    }),

  addSite: (point = { x: 0.5, y: 0.5 }) =>
    commit(set, get, (project) => {
      const id = createId("site");
      project.sites.push({
        id,
        name: "新規拠点",
        siteType: "castle",
        ...clampPoint(point),
        factionId: firstFactionId(project),
        status: "normal",
        certainty: "fictional",
        memo: "表示確認用の仮データ。史実確定ではない。",
        sourceNote: "表示確認用の仮データ。史実確定ではない。",
        visible: true,
        locked: false,
      });
      get().selectObject("site", id);
    }),

  updateSite: (id, patch) => commit(set, get, (project) => applyListPatch(project.sites, id, patch)),
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
        dashed: true,
        visible: true,
        locked: false,
        certainty: "fictional",
        memo: "",
        sourceNote: "",
        keyframes: [
          {
            time: frame?.time ?? project.timeline.currentTime,
            displayDate: frame?.displayDate ?? project.timeline.currentTime,
            points,
            visible: true,
            sourceNote: "",
          },
        ],
      });
      get().selectObject("line", id);
    }),

  updateLine: (id, patch) => commit(set, get, (project) => applyListPatch(project.lines, id, patch)),
  deleteLine: (id) => commit(set, get, (project) => (project.lines = project.lines.filter((line) => line.id !== id))),

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
        opacity: 0.85,
        dashed: false,
        startTime: project.timeline.currentTime,
        endTime: project.timeline.end,
        points,
        visible: true,
        locked: false,
        certainty: "fictional",
        memo: "",
        sourceNote: "",
      });
      get().selectObject("arrow", id);
    }),

  updateArrow: (id, patch) => commit(set, get, (project) => applyListPatch(project.arrows, id, patch)),
  deleteArrow: (id) => commit(set, get, (project) => (project.arrows = project.arrows.filter((arrow) => arrow.id !== id))),

  addEvent: (point = { x: 0.5, y: 0.5 }) =>
    commit(set, get, (project) => {
      const frame = currentFrame(project);
      const id = createId("event");
      project.events.push({
        id,
        eventType: "other",
        title: "新規イベント",
        time: frame?.time ?? project.timeline.currentTime,
        displayDate: frame?.displayDate ?? project.timeline.currentTime,
        ...clampPoint(point),
        description: "",
        certainty: "fictional",
        memo: "",
        sourceNote: "",
        visible: true,
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
        opacity: 0.9,
        visible: true,
        locked: false,
        memo: "",
      });
      get().selectObject("label", id);
    }),

  updateLabel: (id, patch) => commit(set, get, (project) => applyListPatch(project.labels, id, patch)),
  deleteLabel: (id) => commit(set, get, (project) => (project.labels = project.labels.filter((label) => label.id !== id))),

  selectObject: (type, id) => set({ selected: { type, id } }),
  clearSelection: () => set({ selected: { type: null, id: null } }),

  updateUnitKeyframe: (unitId, time, keyframe) =>
    commit(set, get, (project) => {
      const unit = project.units.find((entry) => entry.id === unitId);
      if (!unit) return;
      const frame = getCurrentFrame(project.timeline.frames, time);
      const existing = unit.keyframes.find((entry) => entry.time === time);
      const normalizedPatch: Partial<UnitKeyframe> = {
        ...keyframe,
        ...(keyframe.x !== undefined && keyframe.y !== undefined ? clampPoint({ x: keyframe.x, y: keyframe.y }) : {}),
      };
      if (existing) {
        Object.assign(existing, normalizedPatch);
      } else {
        unit.keyframes.push({
          time,
          displayDate: frame?.displayDate ?? time,
          x: normalizedPatch.x ?? 0.5,
          y: normalizedPatch.y ?? 0.5,
          rotation: normalizedPatch.rotation ?? 0,
          visible: normalizedPatch.visible ?? true,
          status: normalizedPatch.status ?? unit.status,
          factionId: normalizedPatch.factionId,
          certainty: normalizedPatch.certainty as Certainty | undefined,
          sourceNote: normalizedPatch.sourceNote ?? unit.sourceNote,
        });
      }
      unit.keyframes.sort((a, b) => a.time.localeCompare(b.time));
    }),

  deleteUnitKeyframe: (unitId, time) =>
    commit(set, get, (project) => {
      const unit = project.units.find((entry) => entry.id === unitId);
      if (unit) unit.keyframes = unit.keyframes.filter((frame) => frame.time !== time);
    }),

  setInterpolationMode: (mode) =>
    commit(set, get, (project) => {
      project.timeline.interpolationMode = mode;
    }),

  setMapImage: (dataUrl) =>
    commit(set, get, (project) => {
      project.map.imageDataUrl = dataUrl;
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
    const { selected } = get();
    if (!selected.type || !selected.id) return;
    if (selected.type === "unit") get().deleteUnit(selected.id);
    if (selected.type === "site") get().deleteSite(selected.id);
    if (selected.type === "line") get().deleteLine(selected.id);
    if (selected.type === "arrow") get().deleteArrow(selected.id);
    if (selected.type === "event") get().deleteEvent(selected.id);
    if (selected.type === "label") get().deleteLabel(selected.id);
    set({ selected: { type: null, id: null } });
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
    });
  },
}));
