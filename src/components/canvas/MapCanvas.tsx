import { useEffect, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import type Konva from "konva";
import { defaultSiteIconUrl } from "../../data/defaultAssets";
import { useProjectStore } from "../../store/projectStore";
import type { MapLabel, MapRegion, MovableSelectionType, PlacedImage, SelectionMoveUpdate, Site, Unit } from "../../types/project";
import { canvasToRelative, MAP_HEIGHT, MAP_WIDTH, pointsToCanvas } from "../../utils/coordinate";
import { downloadBlob, downloadDataUrl } from "../../utils/fileIO";
import { loadCachedImage } from "../../utils/imageCache";
import { getUnitRouteSegments, getUnitRouteTimeRange, resolveArrowKeyframe, resolveCameraFrame, resolveLineKeyframe, resolvePlacedImageFrame, resolveRegionKeyframe, resolveSiteFrame, resolveUnitFrame, resolveUnitRouteApproachPoint, resolveUnitRouteExitPoint, resolveUnitRoutePoint } from "../../utils/interpolation";
import { createZip, type ZipEntry } from "../../utils/zip";
import { compareTime, parseTimelineSeconds } from "../../utils/time";
import { ArrowShape } from "./ArrowShape";
import { EventMarker } from "./EventMarker";
import { LabelShape } from "./LabelShape";
import { LineShape } from "./LineShape";
import { MarchingAntsRect } from "./SelectionMarchingAnts";
import { PlacedImageShape, placedImageSize } from "./PlacedImageShape";
import { RegionShape } from "./RegionShape";
import { SitePiece } from "./SitePiece";
import { UnitPiece } from "./UnitPiece";

type TimelineExportFormat = "png-sequence" | "jpeg-sequence" | "mp4";
type TimelineExportRequest = { format: TimelineExportFormat; fps: number };
type ExportViewport = { x: number; y: number; width: number; height: number; outputWidth: number; outputHeight: number };
type StillImageExportFormat = "png" | "jpeg";
type CanvasPoint = { x: number; y: number };
type CanvasRect = { x: number; y: number; width: number; height: number };
type MultiSelectionItem = { type: MovableSelectionType; id: string };

const mp4MimeTypes = ["video/mp4", "video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=h264"];

function waitForPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

function safeFilename(name: string) {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");
  return cleaned || "timeline";
}

function clampExportFps(fps: number) {
  if (!Number.isFinite(fps)) return 30;
  return Math.min(120, Math.max(1, Math.round(fps)));
}

function buildExportTimes(start: number, end: number, fps: number) {
  const duration = Math.max(0, end - start);
  const frameCount = Math.max(1, Math.ceil(duration * fps));
  return Array.from({ length: frameCount }, (_, index) => Math.min(end, start + index / fps));
}

function getTimelineExportBounds(project: ReturnType<typeof useProjectStore.getState>["project"]) {
  const frameSeconds = project.timeline.frames.map((frame) => parseTimelineSeconds(frame.time)).filter(Number.isFinite);
  const startSeconds = parseTimelineSeconds(project.timeline.start);
  const endSeconds = parseTimelineSeconds(project.timeline.end);
  const start = Number.isFinite(startSeconds) ? startSeconds : frameSeconds[0] ?? 0;
  const end = Number.isFinite(endSeconds) ? endSeconds : frameSeconds[frameSeconds.length - 1] ?? start;
  return { start, end: Math.max(start, end) };
}

async function dataUrlToBytes(dataUrl: string) {
  const response = await fetch(dataUrl);
  return new Uint8Array(await response.arrayBuffer());
}

async function preloadProjectImages(project: ReturnType<typeof useProjectStore.getState>["project"]) {
  const sources = new Set<string>();
  if (project.map.imageDataUrl) sources.add(project.map.imageDataUrl);
  sources.add(defaultSiteIconUrl);
  for (const site of project.sites) {
    if (site.iconUrl) sources.add(site.iconUrl);
  }
  for (const unit of project.units) {
    if (unit.iconUrl) sources.add(unit.iconUrl);
  }
  for (const image of project.images ?? []) {
    if (image.imageDataUrl) sources.add(image.imageDataUrl);
  }
  await Promise.all([...sources].map((src) => loadCachedImage(src).catch(() => null)));
}

function mp4MimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return mp4MimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function dispatchExportStatus(message: string, busy: boolean) {
  window.dispatchEvent(new CustomEvent("sengoku-export-status", { detail: { message, busy } }));
}

function resolveExportViewport(project: ReturnType<typeof useProjectStore.getState>["project"]): ExportViewport {
  const camera = project.map.exportCamera ?? {
    width: project.map.outputWidth || 1920,
    height: project.map.outputHeight || 1080,
    keyframes: [{ time: project.timeline.currentTime, displayDate: project.timeline.currentTime, x: 0, y: 0 }],
  };
  const frame = resolveCameraFrame(camera, project.timeline.currentTime, project.timeline.interpolationMode);
  return {
    x: frame.x,
    y: frame.y,
    width: Math.max(1, Math.round(frame.width * frame.scale)),
    height: Math.max(1, Math.round(frame.height * frame.scale)),
    outputWidth: Math.max(1, Math.round(frame.width)),
    outputHeight: Math.max(1, Math.round(frame.height)),
  };
}

function drawStageLayerToCanvas(stage: Konva.Stage, context: CanvasRenderingContext2D, width: number, height: number) {
  const sourceCanvas = stage.getLayers()[0]?.getCanvas()._canvas;
  if (!sourceCanvas) throw new Error("動画用キャンバスを取得できません");
  context.clearRect(0, 0, width, height);
  context.drawImage(sourceCanvas, 0, 0, width, height);
}

function estimateLabelTextWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((sum, char) => {
    const wide = /[^\u0020-\u007e]/.test(char);
    return sum + fontSize * (wide ? 1.05 : 0.62);
  }, 0);
}

function labelBoundsSize(label: MapLabel) {
  const horizontalPadding = 11;
  return {
    width: Math.max(70, estimateLabelTextWidth(label.text, label.fontSize) + horizontalPadding * 2),
    height: label.fontSize + 16,
  };
}

function rotateCanvasPoint(point: CanvasPoint, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function unitVisualBounds(unit: Unit, frame: { rotation?: number; size?: number }, position: CanvasPoint): CanvasRect {
  const size = frame.size ?? unit.size;
  const bodyWidth = (unit.iconUrl ? 68 : 92) * size;
  const bodyHeight = (unit.iconUrl ? 68 : 44) * size;
  const isPentagon = (unit.shape ?? "pentagon") === "pentagon";
  const pointDepth = isPentagon ? Math.min(bodyHeight * 0.34, bodyWidth * 0.22) : 0;
  const bodyPoints: CanvasPoint[] = isPentagon
    ? [
        { x: 0, y: -bodyHeight / 2 },
        { x: bodyWidth / 2, y: -bodyHeight / 2 + pointDepth },
        { x: bodyWidth / 2, y: bodyHeight / 2 },
        { x: -bodyWidth / 2, y: bodyHeight / 2 },
        { x: -bodyWidth / 2, y: -bodyHeight / 2 + pointDepth },
      ].map((point) => rotateCanvasPoint(point, frame.rotation ?? 0))
    : [
        { x: -bodyWidth / 2, y: -bodyHeight / 2 },
        { x: bodyWidth / 2, y: -bodyHeight / 2 },
        { x: bodyWidth / 2, y: bodyHeight / 2 },
        { x: -bodyWidth / 2, y: bodyHeight / 2 },
      ];
  const left = Math.min(...bodyPoints.map((point) => point.x));
  const right = Math.max(...bodyPoints.map((point) => point.x));
  const top = Math.min(...bodyPoints.map((point) => point.y));
  const bottom = Math.max(...bodyPoints.map((point) => point.y));
  const nameFontSize = unit.nameFontSize ?? 14 * size;
  const labelWidth = unit.showName === false ? 0 : Math.max(24, estimateLabelTextWidth(unit.name, nameFontSize) + 14);
  const labelBottom = unit.showName === false ? bottom : bottom + nameFontSize + 10;
  const visualLeft = Math.min(left, -labelWidth / 2) - 6;
  const visualRight = Math.max(right, labelWidth / 2) + 6;
  const visualTop = top - 6;
  const visualBottom = labelBottom + 6;
  return {
    x: position.x + visualLeft,
    y: position.y + visualTop,
    width: visualRight - visualLeft,
    height: visualBottom - visualTop,
  };
}

function expandRect(rect: CanvasRect, padding: number): CanvasRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function pointInRect(point: CanvasPoint, rect: CanvasRect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function cross(a: CanvasPoint, b: CanvasPoint, c: CanvasPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: CanvasPoint, start: CanvasPoint, end: CanvasPoint) {
  const epsilon = 0.0001;
  return Math.abs(cross(start, end, point)) <= epsilon && point.x >= Math.min(start.x, end.x) - epsilon && point.x <= Math.max(start.x, end.x) + epsilon && point.y >= Math.min(start.y, end.y) - epsilon && point.y <= Math.max(start.y, end.y) + epsilon;
}

function segmentsIntersect(a: CanvasPoint, b: CanvasPoint, c: CanvasPoint, d: CanvasPoint) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if ((abC > 0 && abD < 0 || abC < 0 && abD > 0) && (cdA > 0 && cdB < 0 || cdA < 0 && cdB > 0)) return true;
  return pointOnSegment(c, a, b) || pointOnSegment(d, a, b) || pointOnSegment(a, c, d) || pointOnSegment(b, c, d);
}

function segmentIntersectsRect(start: CanvasPoint, end: CanvasPoint, rect: CanvasRect) {
  if (pointInRect(start, rect) || pointInRect(end, rect)) return true;
  const topLeft = { x: rect.x, y: rect.y };
  const topRight = { x: rect.x + rect.width, y: rect.y };
  const bottomRight = { x: rect.x + rect.width, y: rect.y + rect.height };
  const bottomLeft = { x: rect.x, y: rect.y + rect.height };
  return segmentsIntersect(start, end, topLeft, topRight) || segmentsIntersect(start, end, topRight, bottomRight) || segmentsIntersect(start, end, bottomRight, bottomLeft) || segmentsIntersect(start, end, bottomLeft, topLeft);
}

function catmullRomPoint(p0: CanvasPoint, p1: CanvasPoint, p2: CanvasPoint, p3: CanvasPoint, t: number): CanvasPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function approximateCanvasPath(points: CanvasPoint[], tension: number) {
  if (points.length < 3 || tension <= 0) return points;
  const result: CanvasPoint[] = [];
  const samplesPerSegment = 16;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    for (let sample = 0; sample <= samplesPerSegment; sample += 1) {
      if (index > 0 && sample === 0) continue;
      result.push(catmullRomPoint(p0, p1, p2, p3, sample / samplesPerSegment));
    }
  }
  return result;
}

function pathIntersectsRect(points: CanvasPoint[], rect: CanvasRect, padding: number, tension: number) {
  const hitRect = expandRect(rect, padding);
  const path = approximateCanvasPath(points, tension);
  if (path.some((point) => pointInRect(point, hitRect))) return true;
  for (let index = 0; index < path.length - 1; index += 1) {
    if (segmentIntersectsRect(path[index], path[index + 1], hitRect)) return true;
  }
  return false;
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const initialCanvasView = useRef(useProjectStore.getState().canvasView);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [stagePosition, setStagePosition] = useState({ x: initialCanvasView.current.x, y: initialCanvasView.current.y });
  const [scale, setScale] = useState(initialCanvasView.current.scale);
  const [exportViewport, setExportViewport] = useState<ExportViewport | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  const [mapImageResizePreview, setMapImageResizePreview] = useState<{ width: number; height: number } | null>(null);
  const [cameraDragPreview, setCameraDragPreview] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<CanvasRect | null>(null);
  const [multiSelected, setMultiSelected] = useState<MultiSelectionItem[]>([]);
  const [multiDragDelta, setMultiDragDelta] = useState<CanvasPoint | null>(null);
  const middlePanRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const mapImageResizeStartRef = useRef<{ width: number; height: number } | null>(null);
  const selectionStartRef = useRef<CanvasPoint | null>(null);
  const selectionJustFinishedRef = useRef(false);
  const multiDragStartRef = useRef<CanvasPoint | null>(null);
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);

  const project = useProjectStore((state) => state.project);
  const mapWidth = project.map.width ?? MAP_WIDTH;
  const mapHeight = project.map.height ?? MAP_HEIGHT;
  const selected = useProjectStore((state) => state.selected);
  const selectedRegionPointIndices = useProjectStore((state) => state.selectedRegionPointIndices);
  const selectedLinePointIndices = useProjectStore((state) => state.selectedLinePointIndices);
  const selectedArrowPointIndices = useProjectStore((state) => state.selectedArrowPointIndices);
  const routePreviewUnitId = useProjectStore((state) => state.routePreviewUnitId);
  const unitPlacementAssetId = useProjectStore((state) => state.unitPlacementAssetId);
  const sitePlacementAssetId = useProjectStore((state) => state.sitePlacementAssetId);
  const imagePlacement = useProjectStore((state) => state.imagePlacement);
  const canvasView = useProjectStore((state) => state.canvasView);
  const tool = useProjectStore((state) => state.tool);
  const drawingPoints = useProjectStore((state) => state.drawingPoints);
  const selectObject = useProjectStore((state) => state.selectObject);
  const clearSelection = useProjectStore((state) => state.clearSelection);
  const toggleRegionPointSelection = useProjectStore((state) => state.toggleRegionPointSelection);
  const toggleLinePointSelection = useProjectStore((state) => state.toggleLinePointSelection);
  const toggleArrowPointSelection = useProjectStore((state) => state.toggleArrowPointSelection);
  const updateUnitKeyframe = useProjectStore((state) => state.updateUnitKeyframe);
  const updateSite = useProjectStore((state) => state.updateSite);
  const updateLineKeyframe = useProjectStore((state) => state.updateLineKeyframe);
  const updateArrowKeyframe = useProjectStore((state) => state.updateArrowKeyframe);
  const updateImageKeyframe = useProjectStore((state) => state.updateImageKeyframe);
  const updateLabel = useProjectStore((state) => state.updateLabel);
  const updateRegionPoints = useProjectStore((state) => state.updateRegionPoints);
  const moveSelectionItems = useProjectStore((state) => state.moveSelectionItems);
  const updateMapImagePlacement = useProjectStore((state) => state.updateMapImagePlacement);
  const updateCameraKeyframe = useProjectStore((state) => state.updateCameraKeyframe);
  const addUnit = useProjectStore((state) => state.addUnit);
  const duplicateUnitFromAsset = useProjectStore((state) => state.duplicateUnitFromAsset);
  const addSite = useProjectStore((state) => state.addSite);
  const duplicateSiteFromAsset = useProjectStore((state) => state.duplicateSiteFromAsset);
  const addImage = useProjectStore((state) => state.addImage);
  const addLabel = useProjectStore((state) => state.addLabel);
  const addDrawingPoint = useProjectStore((state) => state.addDrawingPoint);
  const setTool = useProjectStore((state) => state.setTool);
  const setCanvasView = useProjectStore((state) => state.setCanvasView);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: Math.max(320, entry.contentRect.width),
        height: Math.max(320, entry.contentRect.height),
      });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setStagePosition((position) => (position.x === canvasView.x && position.y === canvasView.y ? position : { x: canvasView.x, y: canvasView.y }));
    setScale((currentScale) => (currentScale === canvasView.scale ? currentScale : canvasView.scale));
  }, [canvasView.x, canvasView.y, canvasView.scale]);

  useEffect(() => {
    setCanvasView({ x: stagePosition.x, y: stagePosition.y, scale });
  }, [scale, setCanvasView, stagePosition.x, stagePosition.y]);

  useEffect(() => {
    if (!project.map.imageDataUrl) {
      setMapImage(null);
      return;
    }
    const image = new window.Image();
    image.onload = () => setMapImage(image);
    image.src = project.map.imageDataUrl;
  }, [project.map.imageDataUrl]);

  useEffect(() => {
    if (tool !== "addUnit" && tool !== "addSite" && tool !== "addImage" && tool !== "addLabel" && tool !== "drawRegion" && tool !== "drawLine" && tool !== "drawArrow") setPreviewPoint(null);
  }, [tool]);

  useEffect(() => {
    if (drawingPoints.length === 0) setPreviewPoint(null);
  }, [drawingPoints.length]);

  useEffect(() => {
    const exportStillImage = (format: StillImageExportFormat) => {
      const sourceProject = useProjectStore.getState().project;
      const viewport = resolveExportViewport(sourceProject);
      const isJpeg = format === "jpeg";
      void captureDataUrl(viewport, isJpeg ? "image/jpeg" : "image/png", isJpeg ? 0.85 : undefined)
        .then((dataUrl) => downloadDataUrl(dataUrl, isJpeg ? "sengoku-battle-map.jpg" : "sengoku-battle-map.png"))
        .catch((error) => {
          const message = error instanceof Error ? error.message : "\u66f8\u304d\u51fa\u3057\u306b\u5931\u6557\u3057\u307e\u3057\u305f";
          dispatchExportStatus(message, false);
          window.alert(message);
        })
        .finally(() => setExportViewport(null));
    };
    const exportPngHandler = () => exportStillImage("png");
    const exportJpegHandler = () => exportStillImage("jpeg");
    const timelineExportHandler = (event: Event) => {
      const detail = (event as CustomEvent<TimelineExportRequest>).detail;
      void exportTimeline(detail);
    };
    const resetHandler = () => {
      setScale(0.58);
      setStagePosition({ x: 40, y: 30 });
    };

    const captureDataUrl = async (viewport: ExportViewport, mimeType = "image/png", quality?: number) => {
      const stage = stageRef.current;
      if (!stage) throw new Error("\u30ad\u30e3\u30f3\u30d0\u30b9\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093");
      await preloadProjectImages(useProjectStore.getState().project);
      setExportViewport(viewport);
      await waitForPaint();
      stage.batchDraw();
      return stage.toDataURL({ x: 0, y: 0, width: viewport.outputWidth, height: viewport.outputHeight, pixelRatio: 1, mimeType, quality });
    };

    const exportTimeline = async (request: TimelineExportRequest) => {
      const stage = stageRef.current;
      if (!stage) return;

      const fps = clampExportFps(request.fps);
      const state = useProjectStore.getState();
      const sourceProject = state.project;
      const originalTime = sourceProject.timeline.currentTime;
      const firstViewport = resolveExportViewport(sourceProject);
      const exportWidth = firstViewport.outputWidth;
      const exportHeight = firstViewport.outputHeight;
      const bounds = getTimelineExportBounds(sourceProject);
      const times = buildExportTimes(bounds.start, bounds.end, fps);
      const basename = safeFilename(sourceProject.projectName);
      const pad = Math.max(4, String(times.length).length);

      try {
        if (request.format === "png-sequence" || request.format === "jpeg-sequence") {
          const isJpegSequence = request.format === "jpeg-sequence";
          const imageLabel = isJpegSequence ? "JPEG" : "PNG";
          const extension = isJpegSequence ? "jpg" : "png";
          const mimeType = isJpegSequence ? "image/jpeg" : "image/png";
          const quality = isJpegSequence ? 0.85 : undefined;
          const entries: ZipEntry[] = [];
          for (let index = 0; index < times.length; index += 1) {
            useProjectStore.getState().setCurrentTime(times[index].toFixed(4));
            const dataUrl = await captureDataUrl(resolveExportViewport(useProjectStore.getState().project), mimeType, quality);
            entries.push({
              name: `${basename}_${String(index + 1).padStart(pad, "0")}.${extension}`,
              data: await dataUrlToBytes(dataUrl),
            });
            dispatchExportStatus(`${imageLabel}\u66f8\u304d\u51fa\u3057\u4e2d ${index + 1}/${times.length}`, true);
          }
          dispatchExportStatus("ZIP\u4f5c\u6210\u4e2d", true);
          downloadBlob(createZip(entries), `${basename}_${fps}fps_${isJpegSequence ? "jpeg" : "png"}_sequence.zip`);
          dispatchExportStatus(`${imageLabel}\u9023\u756a\u3092\u66f8\u304d\u51fa\u3057\u307e\u3057\u305f (${times.length}\u679a)`, false);
          return;
        }

        const mimeType = mp4MimeType();
        if (!mimeType) {
          dispatchExportStatus("\u3053\u306e\u30d6\u30e9\u30a6\u30b6\u306fMP4\u66f8\u304d\u51fa\u3057\u306b\u5bfe\u5fdc\u3057\u3066\u3044\u307e\u305b\u3093", false);
          window.alert("\u3053\u306e\u30d6\u30e9\u30a6\u30b6\u306fMP4\u66f8\u304d\u51fa\u3057\u306b\u5bfe\u5fdc\u3057\u3066\u3044\u307e\u305b\u3093\u3002");
          return;
        }

        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = exportWidth;
        exportCanvas.height = exportHeight;
        const context = exportCanvas.getContext("2d");
        if (!context) throw new Error("\u52d5\u753b\u7528\u30ad\u30e3\u30f3\u30d0\u30b9\u3092\u4f5c\u6210\u3067\u304d\u307e\u305b\u3093");

        const stream = exportCanvas.captureStream(fps);
        const [track] = stream.getVideoTracks();
        const chunks: BlobPart[] = [];
        const recorder = new MediaRecorder(stream, { mimeType });
        const stopped = new Promise<void>((resolve, reject) => {
          recorder.onstop = () => resolve();
          recorder.onerror = () => reject(new Error("MP4\u66f8\u304d\u51fa\u3057\u306b\u5931\u6557\u3057\u307e\u3057\u305f"));
        });
        recorder.ondataavailable = (recordedEvent) => {
          if (recordedEvent.data.size > 0) chunks.push(recordedEvent.data);
        };

        const durationSeconds = Math.max(1 / fps, bounds.end - bounds.start);
        let animationFrameId: number | null = null;
        try {
          await preloadProjectImages(useProjectStore.getState().project);
          useProjectStore.getState().setCurrentTime(bounds.start.toFixed(4));
          setExportViewport(resolveExportViewport(useProjectStore.getState().project));
          await waitForPaint();
          drawStageLayerToCanvas(stage, context, exportWidth, exportHeight);

          recorder.start();
          const startedAt = performance.now();
          await new Promise<void>((resolve) => {
            const tick = async (now: number) => {
              const elapsedSeconds = Math.min(durationSeconds, (now - startedAt) / 1000);
              useProjectStore.getState().setCurrentTime((bounds.start + elapsedSeconds).toFixed(4));
              setExportViewport(resolveExportViewport(useProjectStore.getState().project));
              await waitForPaint();
              drawStageLayerToCanvas(stage, context, exportWidth, exportHeight);
              const progress = Math.min(100, Math.round((elapsedSeconds / durationSeconds) * 100));
              dispatchExportStatus(`MP4\u66f8\u304d\u51fa\u3057\u4e2d ${progress}%`, true);
              if (elapsedSeconds >= durationSeconds) {
                animationFrameId = null;
                resolve();
                return;
              }
              animationFrameId = window.requestAnimationFrame((time) => void tick(time));
            };
            animationFrameId = window.requestAnimationFrame((time) => void tick(time));
          });
          recorder.stop();
          await stopped;
        } finally {
          if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
          track.stop();
          setExportViewport(null);
        }
        downloadBlob(new Blob(chunks, { type: mimeType }), `${basename}_${fps}fps.mp4`);
        dispatchExportStatus("MP4\u3092\u66f8\u304d\u51fa\u3057\u307e\u3057\u305f", false);
      } catch (error) {
        const message = error instanceof Error ? error.message : "\u66f8\u304d\u51fa\u3057\u306b\u5931\u6557\u3057\u307e\u3057\u305f";
        dispatchExportStatus(message, false);
        window.alert(message);
      } finally {
        useProjectStore.getState().setCurrentTime(originalTime);
        setExportViewport(null);
      }
    };

    window.addEventListener("sengoku-export-png", exportPngHandler);
    window.addEventListener("sengoku-export-jpeg", exportJpegHandler);
    window.addEventListener("sengoku-export-timeline", timelineExportHandler);
    window.addEventListener("sengoku-reset-view", resetHandler);
    return () => {
      window.removeEventListener("sengoku-export-png", exportPngHandler);
      window.removeEventListener("sengoku-export-jpeg", exportJpegHandler);
      window.removeEventListener("sengoku-export-timeline", timelineExportHandler);
      window.removeEventListener("sengoku-reset-view", resetHandler);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        setSpacePressed(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const pointerToCanvasPoint = (): CanvasPoint => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return { x: mapWidth / 2, y: mapHeight / 2 };
    return {
      x: (pointer.x - stagePosition.x) / scale,
      y: (pointer.y - stagePosition.y) / scale,
    };
  };

  const pointerToRelative = () => {
    return canvasToRelative(pointerToCanvasPoint(), mapWidth, mapHeight);
  };

  const selectSingle = (type: Parameters<typeof selectObject>[0], id: string | null) => {
    setMultiSelected([]);
    setMultiDragDelta(null);
    selectObject(type, id);
  };

  const makeRectFromPoints = (start: CanvasPoint, end: CanvasPoint): CanvasRect => ({
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  });

  const rectsIntersect = (a: CanvasRect, b: CanvasRect) => a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;

  const selectedItemKey = (item: MultiSelectionItem) => `${item.type}:${item.id}`;

  const selectItemsInRect = (rect: CanvasRect) => {
    if (rect.width < 4 && rect.height < 4) {
      setMultiSelected([]);
      clearSelection();
      return;
    }
    const items: MultiSelectionItem[] = [];
    for (const unit of project.units) {
      const bounds = getSelectableBounds({ type: "unit", id: unit.id });
      if (bounds && rectsIntersect(rect, bounds)) items.push({ type: "unit", id: unit.id });
    }
    for (const site of project.sites) {
      const bounds = getSelectableBounds({ type: "site", id: site.id });
      if (bounds && rectsIntersect(rect, bounds)) items.push({ type: "site", id: site.id });
    }
    for (const image of project.images) {
      if (image.locked) continue;
      const bounds = getSelectableBounds({ type: "image", id: image.id });
      if (bounds && rectsIntersect(rect, bounds)) items.push({ type: "image", id: image.id });
    }
    for (const region of project.regions) {
      if (region.locked || !shouldRenderRegion(region)) continue;
      const bounds = getSelectableBounds({ type: "region", id: region.id });
      if (bounds && rectsIntersect(rect, bounds)) items.push({ type: "region", id: region.id });
    }
    for (const line of project.lines) {
      if (!shouldRenderLine(line)) continue;
      const lineFrameTime = previewRouteTime("line", line.id) ?? project.timeline.currentTime;
      const frame = resolveLineKeyframe(line, lineFrameTime, project.timeline.interpolationMode);
      const tension = line.curveMode === "curve" ? 0.45 : 0;
      const points = frame ? flattenedPointsToCanvasPoints(pointsToCanvas(frame.points, mapWidth, mapHeight)) : [];
      if (points.length >= 2 && pathIntersectsRect(points, rect, Math.max(8, line.width / 2 + 6), tension)) items.push({ type: "line", id: line.id });
    }
    for (const arrow of project.arrows) {
      if (!shouldRenderArrow(arrow)) continue;
      const arrowFrameTime = previewRouteTime("arrow", arrow.id) ?? project.timeline.currentTime;
      if (compareTime(arrow.startTime, arrowFrameTime) > 0 || compareTime(arrow.endTime, arrowFrameTime) < 0) continue;
      const frame = resolveArrowKeyframe(arrow, arrowFrameTime, project.timeline.interpolationMode);
      const tension = arrow.curveMode === "curve" ? 0.45 : 0;
      const points = frame ? flattenedPointsToCanvasPoints(pointsToCanvas(frame.points, mapWidth, mapHeight)) : [];
      if (points.length >= 2 && pathIntersectsRect(points, rect, Math.max(9, arrow.width / 2 + 7), tension)) items.push({ type: "arrow", id: arrow.id });
    }
    for (const label of project.labels) {
      const bounds = getSelectableBounds({ type: "label", id: label.id });
      if (bounds && rectsIntersect(rect, bounds)) items.push({ type: "label", id: label.id });
    }
    setMultiSelected(items);
    setMultiDragDelta(null);
    if (items[0]) selectObject(items[0].type, items[0].id);
    else clearSelection();
  };

  const finishSelectionDrag = () => {
    const start = selectionStartRef.current;
    if (!start) return;
    const rect = makeRectFromPoints(start, pointerToCanvasPoint());
    selectionStartRef.current = null;
    setSelectionRect(null);
    selectionJustFinishedRef.current = true;
    window.setTimeout(() => {
      selectionJustFinishedRef.current = false;
    }, 0);
    selectItemsInRect(rect);
  };

  const updateDrawingPreview = () => {
    if (tool === "addUnit" || tool === "addSite" || tool === "addImage" || tool === "addLabel") {
      setPreviewPoint(pointerToRelative());
      return;
    }
    if (tool !== "drawRegion" && tool !== "drawLine" && tool !== "drawArrow") return;
    if (drawingPoints.length === 0) {
      setPreviewPoint(null);
      return;
    }
    setPreviewPoint(pointerToRelative());
  };

  const onStageMouseMove = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (middlePanRef.current.active) {
      event.evt.preventDefault();
      const nextX = event.evt.clientX;
      const nextY = event.evt.clientY;
      const dx = nextX - middlePanRef.current.x;
      const dy = nextY - middlePanRef.current.y;
      middlePanRef.current = { active: true, x: nextX, y: nextY };
      setStagePosition((position) => ({ x: position.x + dx, y: position.y + dy }));
      return;
    }
    if (selectionStartRef.current) {
      event.evt.preventDefault();
      setSelectionRect(makeRectFromPoints(selectionStartRef.current, pointerToCanvasPoint()));
      return;
    }
    updateDrawingPreview();
  };

  const stopMiddlePan = () => {
    middlePanRef.current.active = false;
  };

  const onWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    const oldScale = scale;
    const direction = event.evt.deltaY > 0 ? -1 : 1;
    const nextScale = Math.min(2.8, Math.max(0.25, oldScale * (direction > 0 ? 1.08 : 0.92)));
    const mousePointTo = {
      x: (pointer.x - stagePosition.x) / oldScale,
      y: (pointer.y - stagePosition.y) / oldScale,
    };
    setScale(nextScale);
    setStagePosition({
      x: pointer.x - mousePointTo.x * nextScale,
      y: pointer.y - mousePointTo.y * nextScale,
    });
  };

  const onCanvasClick = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (selectionJustFinishedRef.current) return;
    const point = pointerToRelative();
    if (tool === "addUnit") {
      if (unitPlacementAssetId) duplicateUnitFromAsset(unitPlacementAssetId, point);
      else addUnit(point);
      setTool("select");
      return;
    }
    if (tool === "addSite") {
      if (sitePlacementAssetId) duplicateSiteFromAsset(sitePlacementAssetId, point);
      else addSite(point);
      setTool("select");
      return;
    }
    if (tool === "addImage") {
      if (imagePlacement) addImage(point);
      setTool("select");
      return;
    }
    if (tool === "drawRegion" || tool === "drawLine" || tool === "drawArrow") {
      addDrawingPoint(point);
      return;
    }
    if (event.target !== event.target.getStage()) return;
    if (tool === "addLabel") {
      addLabel(point);
      window.setTimeout(() => setTool("select"), 0);
    } else if (tool === "mapImageEdit") {
      if (project.map.imageDataUrl) selectSingle("mapImage", "mapImage");
    } else {
      setMultiSelected([]);
      clearSelection();
    }
  };

  const resolvedCameraFrame = resolveExportViewport(project);
  const cameraFrame = cameraDragPreview ? { ...resolvedCameraFrame, ...cameraDragPreview } : resolvedCameraFrame;
  const viewportWorld = exportViewport ?? {
    x: -stagePosition.x / scale,
    y: -stagePosition.y / scale,
    width: size.width / scale,
    height: size.height / scale,
  };
  const exportContentScale = exportViewport ? { x: exportViewport.outputWidth / exportViewport.width, y: exportViewport.outputHeight / exportViewport.height } : { x: 1, y: 1 };
  const contentOffset = exportViewport ? { x: -exportViewport.x * exportContentScale.x, y: -exportViewport.y * exportContentScale.y } : { x: 0, y: 0 };
  const cameraLegendEnabled = project.cameraLegend?.showFactions ?? true;
  const cameraLegendSize = Math.min(3, Math.max(0.5, project.cameraLegend?.factionSize ?? 1));
  const cameraLegendFactions = cameraLegendEnabled ? project.factions.filter((faction) => faction.showInCameraLegend) : [];
  const cameraLegendOverlay = (() => {
    if (cameraLegendFactions.length === 0) return null;
    const viewport = exportViewport ?? cameraFrame;
    const exportPixelToWorld = Math.max(
      0.0001,
      Math.min(
        viewport.width / Math.max(1, viewport.outputWidth),
        viewport.height / Math.max(1, viewport.outputHeight),
      ),
    );
    const fontSize = 14 * cameraLegendSize;
    const rowHeight = 22 * cameraLegendSize;
    const paddingX = 0;
    const paddingY = 0;
    const gap = 8 * cameraLegendSize;
    const radius = 7.5 * cameraLegendSize;
    const textYOffset = 2 * cameraLegendSize;
    const textStrokeWidth = Math.max(0.35, 0.55 * cameraLegendSize);
    const margin = 4;
    const textWidth = Math.max(...cameraLegendFactions.map((faction) => estimateLabelTextWidth(faction.name, fontSize)), 48);
    return {
      x: viewport.x + margin * exportPixelToWorld,
      y: viewport.y + margin * exportPixelToWorld,
      scale: exportPixelToWorld,
      width: paddingX * 2 + radius * 2 + gap + textWidth,
      height: paddingY * 2 + rowHeight * cameraLegendFactions.length,
      fontSize,
      rowHeight,
      paddingX,
      paddingY,
      gap,
      radius,
      textYOffset,
      textStrokeWidth,
      textWidth,
    };
  })();

  const mapImageRect = (() => {
    if (!mapImage?.naturalWidth || !mapImage.naturalHeight) return null;
    const imageAspect = mapImage.naturalWidth / mapImage.naturalHeight;
    const canvasAspect = mapWidth / mapHeight;
    const fallback =
      imageAspect > canvasAspect
        ? { x: 0, y: (mapHeight - mapWidth / imageAspect) / 2, width: mapWidth, height: mapWidth / imageAspect }
        : { x: (mapWidth - mapHeight * imageAspect) / 2, y: 0, width: mapHeight * imageAspect, height: mapHeight };
    const imageWidth = mapImageResizePreview?.width ?? project.map.imageWidth ?? fallback.width;
    const imageHeight = imageWidth / imageAspect;
    return {
      x: project.map.imageX ?? fallback.x,
      y: project.map.imageY ?? fallback.y,
      width: imageWidth,
      height: imageHeight,
    };
  })();
  const gridPadding = 320;
  const gridLeft = Math.floor((Math.min(viewportWorld.x, 0, cameraFrame.x, mapImageRect?.x ?? 0) - gridPadding) / 80) * 80;
  const gridTop = Math.floor((Math.min(viewportWorld.y, 0, cameraFrame.y, mapImageRect?.y ?? 0) - gridPadding) / 80) * 80;
  const gridRight = Math.ceil((Math.max(viewportWorld.x + viewportWorld.width, mapWidth, cameraFrame.x + cameraFrame.width, mapImageRect ? mapImageRect.x + mapImageRect.width : 0) + gridPadding) / 80) * 80;
  const gridBottom = Math.ceil((Math.max(viewportWorld.y + viewportWorld.height, mapHeight, cameraFrame.y + cameraFrame.height, mapImageRect ? mapImageRect.y + mapImageRect.height : 0) + gridPadding) / 80) * 80;
  const gridLines = [];
  for (let x = gridLeft; x <= gridRight; x += 80) gridLines.push(<Line key={`x${x}`} points={[x, gridTop, x, gridBottom]} stroke="#273241" strokeWidth={1} listening={false} />);
  for (let y = gridTop; y <= gridBottom; y += 80) gridLines.push(<Line key={`y${y}`} points={[gridLeft, y, gridRight, y]} stroke="#273241" strokeWidth={1} listening={false} />);

  const withoutSelected = <T extends { id: string }>(items: T[], type: typeof selected.type) => {
    if (exportViewport) return items;
    return items.filter((item) => !isSelected(type, item.id));
  };
  const isMultiSelected = (type: typeof selected.type, id: string) => multiSelected.some((item) => item.type === type && item.id === id);
  const isSelected = (type: typeof selected.type, id: string) => !exportViewport && ((selected.type === type && selected.id === id) || isMultiSelected(type, id));
  const isMapImageEditing = !exportViewport && tool === "mapImageEdit" && selected.type === "mapImage" && selected.id === "mapImage";
  const cameraHandleOffset = { x: -40, y: -36 };
  const routePreviewUnit = routePreviewUnitId ? project.units.find((unit) => unit.id === routePreviewUnitId) : undefined;
  const activePreviewRoute = routePreviewUnit?.route;
  const activePreviewRouteSegments = getUnitRouteSegments(activePreviewRoute);
  const isPreviewRouteSource = (sourceType: "line" | "arrow", sourceId: string) => activePreviewRouteSegments.some((segment) => segment.sourceType === sourceType && segment.sourceId === sourceId);
  const previewRouteTime = (sourceType: "line" | "arrow", sourceId: string) => {
    const matchingSegment =
      activePreviewRouteSegments.find((segment) => segment.sourceType === sourceType && segment.sourceId === sourceId && compareTime(project.timeline.currentTime, segment.startTime) >= 0 && compareTime(project.timeline.currentTime, segment.endTime) <= 0) ??
      activePreviewRouteSegments.find((segment) => segment.sourceType === sourceType && segment.sourceId === sourceId);
    if (!matchingSegment) return null;
    if (compareTime(project.timeline.currentTime, matchingSegment.startTime) < 0) return matchingSegment.startTime;
    if (compareTime(project.timeline.currentTime, matchingSegment.endTime) > 0) return matchingSegment.endTime;
    return project.timeline.currentTime;
  };
  const shouldRenderLine = (line: (typeof project.lines)[number]) => !line.hideWhenRoute || isPreviewRouteSource("line", line.id);
  const shouldRenderArrow = (arrow: (typeof project.arrows)[number]) => !arrow.hideWhenRoute || isPreviewRouteSource("arrow", arrow.id);
  const arrowRevealProgress = (arrow: (typeof project.arrows)[number], time: string) => {
    if (!arrow.revealAlongPath) return 1;
    const duration = Math.max(0.1, arrow.revealDurationSeconds ?? 1);
    return (parseTimelineSeconds(time) - parseTimelineSeconds(arrow.startTime)) / duration;
  };
  const shouldRenderRegion = (region: MapRegion) => (!region.displayStartTime || compareTime(region.displayStartTime, project.timeline.currentTime) <= 0) && (!region.displayEndTime || compareTime(region.displayEndTime, project.timeline.currentTime) >= 0);
  const regionFillColor = (region: MapRegion) => {
    if (!region.useFactionColor) return region.fillColor;
    return project.factions.find((faction) => faction.id === region.factionId)?.color ?? region.fillColor;
  };
  const regionDisplayOrder = (region: MapRegion) => (Number.isFinite(region.displayOrder) ? region.displayOrder : 0);
  const orderedRegions = project.regions
    .map((region, index) => ({
      region,
      index,
      frame: resolveRegionKeyframe(region, project.timeline.currentTime, project.timeline.interpolationMode),
    }))
    .filter(({ region, frame }) => shouldRenderRegion(region) && Boolean(frame) && (frame?.points.length ?? 0) >= 3)
    .sort((left, right) => regionDisplayOrder(left.region) - regionDisplayOrder(right.region) || left.index - right.index);
  const regionMaskPolygons = (regionId: string) => {
    const currentIndex = orderedRegions.findIndex(({ region }) => region.id === regionId);
    if (currentIndex < 0) return [];
    return orderedRegions.slice(currentIndex + 1).map(({ frame }) => pointsToCanvas(frame?.points ?? [], mapWidth, mapHeight));
  };
  const resolveDisplayRegion = (region: MapRegion) => resolveRegionKeyframe(region, project.timeline.currentTime, project.timeline.interpolationMode);
  const resolveDisplayUnitFrame = (unit: (typeof project.units)[number]) => {
    const routeRange = getUnitRouteTimeRange(unit.route);
    const afterRoute = Boolean(routeRange && compareTime(project.timeline.currentTime, routeRange.endTime) > 0);
    const routePoint = afterRoute ? null : resolveUnitRoutePoint(unit, project.lines, project.arrows, project.timeline.currentTime, project.timeline.interpolationMode);
    const routeApproachPoint = routePoint ? null : resolveUnitRouteApproachPoint(unit, project.lines, project.arrows, project.timeline.currentTime, project.timeline.interpolationMode);
    const routeExitPoint = afterRoute ? resolveUnitRouteExitPoint(unit, project.lines, project.arrows, project.timeline.currentTime, project.timeline.interpolationMode) : null;
    const frame = resolveUnitFrame(unit, project.timeline.currentTime, project.timeline.interpolationMode);
    const effectiveRoutePoint = routePoint ?? routeApproachPoint ?? routeExitPoint;
    if (!frame && !effectiveRoutePoint) return null;
    if (!frame && effectiveRoutePoint) {
      const displayStartTime = unit.displayStartTime ?? routeRange?.startTime;
      const displayEndTime = unit.displayEndTime;
      if (displayStartTime && compareTime(project.timeline.currentTime, displayStartTime) < 0) return null;
      if (displayEndTime && compareTime(project.timeline.currentTime, displayEndTime) > 0) return null;
      return {
        time: project.timeline.currentTime,
        displayDate: project.timeline.frames.find((entry) => entry.time === project.timeline.currentTime)?.displayDate ?? project.timeline.currentTime,
        x: effectiveRoutePoint.x,
        y: effectiveRoutePoint.y,
        rotation: 0,
        size: unit.size,
        status: unit.status,
        factionId: unit.factionId,
        certainty: unit.certainty,
        sourceNote: unit.sourceNote,
        effectiveFactionId: unit.factionId,
        effectiveCertainty: unit.certainty,
      };
    }
    if (!frame) return null;
    return effectiveRoutePoint ? { ...frame, x: effectiveRoutePoint.x, y: effectiveRoutePoint.y } : frame;
  };
  const deltaRelative = multiDragDelta ? { x: multiDragDelta.x / mapWidth, y: multiDragDelta.y / mapHeight } : { x: 0, y: 0 };
  const offsetPoint = <T extends { x: number; y: number }>(point: T, delta = deltaRelative): T => ({ ...point, x: point.x + delta.x, y: point.y + delta.y });
  const selectablePointsBounds = (points: CanvasPoint[], padding: number): CanvasRect | null => {
    if (points.length === 0) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const x = Math.min(...xs) - padding;
    const y = Math.min(...ys) - padding;
    return { x, y, width: Math.max(...xs) - Math.min(...xs) + padding * 2, height: Math.max(...ys) - Math.min(...ys) + padding * 2 };
  };
  const flattenedPointsToCanvasPoints = (points: number[]): CanvasPoint[] => {
    const result: CanvasPoint[] = [];
    for (let index = 0; index < points.length - 1; index += 2) {
      result.push({ x: points[index], y: points[index + 1] });
    }
    return result;
  };
  const getSelectableBounds = (item: MultiSelectionItem): CanvasRect | null => {
    if (item.type === "unit") {
      const unit = project.units.find((entry) => entry.id === item.id);
      const frame = unit ? resolveDisplayUnitFrame(unit) : null;
      if (!unit || !frame) return null;
      const position = { x: frame.x * mapWidth, y: frame.y * mapHeight };
      return unitVisualBounds(unit, frame, position);
    }
    if (item.type === "site") {
      const site = project.sites.find((entry) => entry.id === item.id);
      if (!site) return null;
      const size = site.size ?? 1;
      const position = { x: site.x * mapWidth, y: site.y * mapHeight };
      const width = 82 * size;
      const height = 96 * size;
      return { x: position.x - width / 2, y: position.y - height / 2, width, height };
    }
    if (item.type === "image") {
      const image = project.images.find((entry) => entry.id === item.id);
      if (!image) return null;
      const frame = resolvePlacedImageFrame(image, project.timeline.currentTime, project.timeline.interpolationMode);
      const size = placedImageSize(image);
      const position = { x: frame.x * mapWidth, y: frame.y * mapHeight };
      return { x: position.x - size.width / 2, y: position.y - size.height / 2, width: size.width, height: size.height };
    }
    if (item.type === "region") {
      const region = project.regions.find((entry) => entry.id === item.id);
      if (!region || !shouldRenderRegion(region)) return null;
      const frame = resolveDisplayRegion(region);
      return frame ? selectablePointsBounds(flattenedPointsToCanvasPoints(pointsToCanvas(frame.points, mapWidth, mapHeight)), 8) : null;
    }
    if (item.type === "line") {
      const line = project.lines.find((entry) => entry.id === item.id);
      if (!line || !shouldRenderLine(line)) return null;
      const frame = resolveLineKeyframe(line, previewRouteTime("line", line.id) ?? project.timeline.currentTime, project.timeline.interpolationMode);
      return frame ? selectablePointsBounds(flattenedPointsToCanvasPoints(pointsToCanvas(frame.points, mapWidth, mapHeight)), Math.max(10, line.width + 8)) : null;
    }
    if (item.type === "label") {
      const label = project.labels.find((entry) => entry.id === item.id);
      if (!label || (label.startTime && compareTime(label.startTime, project.timeline.currentTime) > 0) || (label.endTime && compareTime(label.endTime, project.timeline.currentTime) < 0)) return null;
      const size = labelBoundsSize(label);
      const position = { x: label.x * mapWidth, y: label.y * mapHeight };
      return { x: position.x - size.width / 2, y: position.y - size.height / 2, width: size.width, height: size.height };
    }
    const arrow = project.arrows.find((entry) => entry.id === item.id);
    if (!arrow || !shouldRenderArrow(arrow)) return null;
    const arrowFrameTime = previewRouteTime("arrow", arrow.id) ?? project.timeline.currentTime;
    if (compareTime(arrow.startTime, arrowFrameTime) > 0 || compareTime(arrow.endTime, arrowFrameTime) < 0) return null;
    const frame = resolveArrowKeyframe(arrow, arrowFrameTime, project.timeline.interpolationMode);
    return frame ? selectablePointsBounds(flattenedPointsToCanvasPoints(pointsToCanvas(frame.points, mapWidth, mapHeight)), Math.max(12, arrow.width + 12)) : null;
  };
  const selectedBounds = (() => {
    const bounds = multiSelected.map(getSelectableBounds).filter((entry): entry is CanvasRect => Boolean(entry));
    if (bounds.length === 0) return null;
    const left = Math.min(...bounds.map((entry) => entry.x));
    const top = Math.min(...bounds.map((entry) => entry.y));
    const right = Math.max(...bounds.map((entry) => entry.x + entry.width));
    const bottom = Math.max(...bounds.map((entry) => entry.y + entry.height));
    const dx = multiDragDelta?.x ?? 0;
    const dy = multiDragDelta?.y ?? 0;
    return { x: left + dx, y: top + dy, width: right - left, height: bottom - top };
  })();
  const frontSelectedItems = (multiSelected.length > 0 ? multiSelected : selected.type && selected.id && ["unit", "site", "image", "line", "arrow", "label"].includes(selected.type) ? [{ type: selected.type as MovableSelectionType, id: selected.id }] : []).filter(
    (item, index, items) => item.type !== "region" && items.findIndex((entry) => selectedItemKey(entry) === selectedItemKey(item)) === index,
  );
  const moveSelectedItems = (delta: CanvasPoint) => {
    const relativeDelta = { x: delta.x / mapWidth, y: delta.y / mapHeight };
    const updates: SelectionMoveUpdate[] = [];
    for (const item of multiSelected) {
      if (item.type === "unit") {
        const unit = project.units.find((entry) => entry.id === item.id);
        const frame = unit ? resolveDisplayUnitFrame(unit) : null;
        if (unit && frame && !unit.locked) updates.push({ type: "unit", id: unit.id, x: frame.x + relativeDelta.x, y: frame.y + relativeDelta.y });
      } else if (item.type === "site") {
        const site = project.sites.find((entry) => entry.id === item.id);
        if (site && !site.locked) updates.push({ type: "site", id: site.id, x: site.x + relativeDelta.x, y: site.y + relativeDelta.y });
      } else if (item.type === "image") {
        const image = project.images.find((entry) => entry.id === item.id);
        const frame = image ? resolvePlacedImageFrame(image, project.timeline.currentTime, project.timeline.interpolationMode) : null;
        if (image && frame && !image.locked) updates.push({ type: "image", id: image.id, x: frame.x + relativeDelta.x, y: frame.y + relativeDelta.y });
      } else if (item.type === "line") {
        const line = project.lines.find((entry) => entry.id === item.id);
        const frame = line ? resolveLineKeyframe(line, previewRouteTime("line", line.id) ?? project.timeline.currentTime, project.timeline.interpolationMode) : null;
        if (line && frame && !line.locked) updates.push({ type: "line", id: line.id, points: frame.points.map((point) => offsetPoint(point, relativeDelta)) });
      } else if (item.type === "region") {
        const region = project.regions.find((entry) => entry.id === item.id);
        const frame = region ? resolveDisplayRegion(region) : null;
        if (region && frame && !region.locked) updates.push({ type: "region", id: region.id, points: frame.points.map((point) => offsetPoint(point, relativeDelta)) });
      } else if (item.type === "arrow") {
        const arrow = project.arrows.find((entry) => entry.id === item.id);
        const frame = arrow ? resolveArrowKeyframe(arrow, previewRouteTime("arrow", arrow.id) ?? project.timeline.currentTime, project.timeline.interpolationMode) : null;
        if (arrow && frame && !arrow.locked) updates.push({ type: "arrow", id: arrow.id, points: frame.points.map((point) => offsetPoint(point, relativeDelta)) });
      } else {
        const label = project.labels.find((entry) => entry.id === item.id);
        if (label && !label.locked) updates.push({ type: "label", id: label.id, x: label.x + relativeDelta.x, y: label.y + relativeDelta.y });
      }
    }
    if (updates.length > 0) moveSelectionItems(updates);
  };
  const unitPlacementPreview = (() => {
    if (exportViewport || tool !== "addUnit" || !previewPoint) return null;
    const asset = unitPlacementAssetId ? project.unitAssets.find((entry) => entry.id === unitPlacementAssetId) : null;
    const factionId = asset && project.factions.some((faction) => faction.id === asset.factionId) ? asset.factionId : project.factions[0]?.id ?? "faction_default_a";
    const previewUnit: Unit = {
      id: "unit-placement-preview",
      name: asset?.name ?? "新規軍勢",
      factionId,
      unitType: "busho",
      commander: "",
      troopType: "mixed",
      strengthText: "",
      status: "normal",
      certainty: "confirmed",
      locked: true,
      size: asset?.size ?? 1,
      shape: asset?.shape ?? "pentagon",
      assetId: asset?.id,
      iconUrl: asset?.imageDataUrl,
      showName: asset?.showName ?? true,
      nameTextColor: asset?.nameTextColor ?? "#f5efe3",
      nameBackgroundEnabled: asset?.nameBackgroundEnabled ?? false,
      nameBackgroundColor: asset?.nameBackgroundColor ?? "#111827",
      nameOutlineEnabled: asset?.nameOutlineEnabled ?? false,
      nameOutlineColor: asset?.nameOutlineColor ?? "#111827",
      memo: "",
      sourceNote: "",
      keyframes: [],
    };
    const frame = {
      time: project.timeline.currentTime,
      displayDate: project.timeline.frames.find((entry) => entry.time === project.timeline.currentTime)?.displayDate ?? project.timeline.currentTime,
      x: previewPoint.x,
      y: previewPoint.y,
      rotation: asset?.rotation ?? 0,
      size: asset?.size ?? 1,
      status: "normal" as const,
      factionId,
      certainty: "confirmed" as const,
      sourceNote: "",
      effectiveFactionId: factionId,
      effectiveCertainty: "confirmed" as const,
    };
    const faction = project.factions.find((entry) => entry.id === factionId);
    return { unit: previewUnit, frame, color: faction?.color ?? "#8a96a8" };
  })();
  const sitePlacementPreview = (() => {
    if (exportViewport || tool !== "addSite" || !previewPoint) return null;
    const asset = sitePlacementAssetId ? project.siteAssets.find((entry) => entry.id === sitePlacementAssetId) : null;
    const factionId = asset?.factionId ?? project.factions[0]?.id ?? "faction_default_a";
    const faction = project.factions.find((entry) => entry.id === factionId);
    const previewSite: Site = {
      id: "site-placement-preview",
      name: asset?.name ?? "新規拠点",
      x: previewPoint.x,
      y: previewPoint.y,
      factionId,
      status: "normal",
      certainty: "confirmed",
      memo: "",
      sourceNote: "",
      locked: true,
      size: asset?.size ?? 1,
      nameFontSize: asset?.nameFontSize ?? 14,
      assetId: asset?.id,
      showName: true,
      nameTextColor: asset?.nameTextColor ?? "#f5efe3",
      nameBackgroundEnabled: asset?.nameBackgroundEnabled ?? false,
      nameBackgroundColor: asset?.nameBackgroundColor ?? "#111827",
      nameOutlineEnabled: asset?.nameOutlineEnabled ?? false,
      nameOutlineColor: asset?.nameOutlineColor ?? "#111827",
      iconUrl: asset?.imageDataUrl,
      keyframes: [],
    };
    return { site: previewSite, color: faction?.color ?? "#8a96a8" };
  })();
  const imagePlacementPreview = (() => {
    if (exportViewport || tool !== "addImage" || !previewPoint || !imagePlacement) return null;
    const previewImage: PlacedImage = {
      id: "image-placement-preview",
      name: imagePlacement.name || "画像",
      imageDataUrl: imagePlacement.dataUrl,
      naturalWidth: imagePlacement.naturalWidth,
      naturalHeight: imagePlacement.naturalHeight,
      x: previewPoint.x,
      y: previewPoint.y,
      size: imagePlacement.size ?? 1,
      locked: true,
      memo: "",
      keyframes: [],
    };
    return {
      imageObject: previewImage,
      frame: {
        time: project.timeline.currentTime,
        displayDate: project.timeline.frames.find((entry) => entry.time === project.timeline.currentTime)?.displayDate ?? project.timeline.currentTime,
        x: previewPoint.x,
        y: previewPoint.y,
      },
    };
  })();
  const labelPlacementPreview = (() => {
    if (exportViewport || tool !== "addLabel" || !previewPoint) return null;
    const previewLabel: MapLabel = {
      id: "label-placement-preview",
      text: "注記",
      x: previewPoint.x,
      y: previewPoint.y,
      fontSize: 24,
      color: "#fff7e6",
      backgroundColor: "#111827",
      borderColor: "#f0c665",
      opacity: 0.9,
      locked: true,
      memo: "",
    };
    return previewLabel;
  })();

  return (
    <div className="canvas-container" ref={containerRef}>
      <Stage
        ref={stageRef}
        width={exportViewport?.outputWidth ?? size.width}
        height={exportViewport?.outputHeight ?? size.height}
        onWheel={onWheel}
        onClick={onCanvasClick}
        onTap={onCanvasClick}
        onMouseMove={onStageMouseMove}
        draggable={!exportViewport && spacePressed}
        x={exportViewport ? 0 : stagePosition.x}
        y={exportViewport ? 0 : stagePosition.y}
        scaleX={exportViewport ? 1 : scale}
        scaleY={exportViewport ? 1 : scale}
        onMouseDown={(event) => {
          if (event.evt.button === 1) {
            event.evt.preventDefault();
            middlePanRef.current = { active: true, x: event.evt.clientX, y: event.evt.clientY };
            return;
          }
          if (!exportViewport && event.evt.button === 0 && event.target === event.target.getStage() && tool === "select" && !spacePressed) {
            const start = pointerToCanvasPoint();
            selectionStartRef.current = start;
            setSelectionRect({ x: start.x, y: start.y, width: 0, height: 0 });
          }
        }}
        onMouseUp={() => {
          if (selectionStartRef.current) finishSelectionDrag();
          stopMiddlePan();
        }}
        onMouseLeave={() => {
          setPreviewPoint(null);
          selectionStartRef.current = null;
          setSelectionRect(null);
          stopMiddlePan();
        }}
        onDragEnd={(event) => {
          const stage = stageRef.current;
          if (!stage || event.target !== stage) return;
          setStagePosition({ x: stage.x(), y: stage.y() });
        }}
      >
        <Layer>
          <Group x={contentOffset.x} y={contentOffset.y} scaleX={exportContentScale.x} scaleY={exportContentScale.y}>
          <Rect x={gridLeft} y={gridTop} width={gridRight - gridLeft} height={gridBottom - gridTop} fill="#16202b" listening={false} />
          {gridLines}
          {mapImage && mapImageRect && (
            <Group
              x={mapImageRect.x}
              y={mapImageRect.y}
              draggable={isMapImageEditing && !spacePressed}
              onClick={(event) => {
                if (tool !== "mapImageEdit") return;
                event.cancelBubble = true;
                selectSingle("mapImage", "mapImage");
              }}
              onTap={(event) => {
                if (tool !== "mapImageEdit") return;
                event.cancelBubble = true;
                selectSingle("mapImage", "mapImage");
              }}
              onDragEnd={(event) => {
                updateMapImagePlacement({ imageX: event.target.x(), imageY: event.target.y() });
              }}
            >
              <KonvaImage image={mapImage} width={mapImageRect.width} height={mapImageRect.height} opacity={0.95} listening={isMapImageEditing} />
            </Group>
          )}

          {orderedRegions
            .map(({ region, frame }) => {
              if (!frame) return null;
              const displayRegion = { ...region, points: frame.points };
              return (
                <RegionShape
                  key={region.id}
                  region={displayRegion}
                  fillColor={regionFillColor(region)}
                  selected={isSelected("region", region.id)}
                  editable={!region.locked}
                  mapWidth={mapWidth}
                  mapHeight={mapHeight}
                  maskPolygons={regionMaskPolygons(region.id)}
                  selectedPointIndices={isSelected("region", region.id) ? selectedRegionPointIndices : []}
                  onSelect={() => selectSingle("region", region.id)}
                  onPointSelect={(pointIndex) => toggleRegionPointSelection(region.id, pointIndex)}
                  onPointDragEnd={(pointIndex, x, y) => {
                    const points = frame.points.map((point, index) => (index === pointIndex ? { x, y } : point));
                    updateRegionPoints(region.id, points);
                  }}
                />
              );
            })}

          {withoutSelected(project.images, "image").map((imageObject) => {
            const frame = resolvePlacedImageFrame(imageObject, project.timeline.currentTime, project.timeline.interpolationMode);
            return (
              <PlacedImageShape
                key={imageObject.id}
                imageObject={imageObject}
                frame={frame}
                selected={isSelected("image", imageObject.id)}
                mapWidth={mapWidth}
                mapHeight={mapHeight}
                onSelect={() => selectSingle("image", imageObject.id)}
                onDragEnd={(x, y) => updateImageKeyframe(imageObject.id, project.timeline.currentTime, { x, y })}
              />
            );
          })}

          {imagePlacementPreview && (
            <Group opacity={0.48} listening={false}>
              <PlacedImageShape
                imageObject={imagePlacementPreview.imageObject}
                frame={imagePlacementPreview.frame}
                selected={false}
                mapWidth={mapWidth}
                mapHeight={mapHeight}
                onSelect={() => undefined}
                onDragEnd={() => undefined}
              />
            </Group>
          )}

          {withoutSelected(project.lines, "line").map((line) => {
            if (!shouldRenderLine(line)) return null;
            const frame = resolveLineKeyframe(line, previewRouteTime("line", line.id) ?? project.timeline.currentTime, project.timeline.interpolationMode);
            if (!frame) return null;
            return (
              <LineShape
                key={line.id}
                line={line}
                frame={frame}
                selected={isSelected("line", line.id)}
                preview={isPreviewRouteSource("line", line.id)}
                selectedPointIndices={isSelected("line", line.id) ? selectedLinePointIndices : []}
                mapWidth={mapWidth}
                mapHeight={mapHeight}
                onSelect={() => selectSingle("line", line.id)}
                onPointSelect={(pointIndex) => toggleLinePointSelection(line.id, pointIndex)}
                onPointDragEnd={(pointIndex, x, y) => {
                  const points = frame.points.map((point, index) => (index === pointIndex ? { x, y } : point));
                  updateLineKeyframe(line.id, project.timeline.currentTime, points);
                }}
              />
            );
          })}

          {withoutSelected(project.arrows, "arrow").map((arrow) => {
            if (!shouldRenderArrow(arrow)) return null;
            const arrowFrameTime = previewRouteTime("arrow", arrow.id) ?? project.timeline.currentTime;
            if (compareTime(arrow.startTime, arrowFrameTime) > 0 || compareTime(arrow.endTime, arrowFrameTime) < 0) return null;
            const frame = resolveArrowKeyframe(arrow, arrowFrameTime, project.timeline.interpolationMode);
            if (!frame) return null;
            return (
              <ArrowShape
                key={arrow.id}
                arrow={arrow}
                frame={frame}
                selected={isSelected("arrow", arrow.id)}
                preview={isPreviewRouteSource("arrow", arrow.id)}
                revealProgress={arrowRevealProgress(arrow, arrowFrameTime)}
                selectedPointIndices={isSelected("arrow", arrow.id) ? selectedArrowPointIndices : []}
                mapWidth={mapWidth}
                mapHeight={mapHeight}
                onSelect={() => selectSingle("arrow", arrow.id)}
                onPointSelect={(pointIndex) => toggleArrowPointSelection(arrow.id, pointIndex)}
                onPointDragEnd={(pointIndex, x, y) => {
                  const points = frame.points.map((point, index) => (index === pointIndex ? { x, y } : point));
                  updateArrowKeyframe(arrow.id, project.timeline.currentTime, points);
                }}
              />
            );
          })}

          {drawingPoints.length > 0 && tool !== "drawRegion" && (
            <Line
              points={pointsToCanvas(drawingPoints, mapWidth, mapHeight)}
              stroke={tool === "drawArrow" ? "#f46f5e" : "#f4d06f"}
              strokeWidth={4}
              dash={[10, 8]}
              lineCap="round"
              lineJoin="round"
            />
          )}

          {tool === "drawRegion" && drawingPoints.length > 0 && (
            <Line
              points={pointsToCanvas(drawingPoints, mapWidth, mapHeight)}
              closed={drawingPoints.length >= 3}
              fill={drawingPoints.length >= 3 ? "rgba(47, 126, 216, 0.28)" : undefined}
              stroke="#82a7d9"
              strokeWidth={3}
              dash={[10, 8]}
              lineJoin="round"
              listening={false}
            />
          )}

          {drawingPoints.length > 0 && previewPoint && (
            <Line
              points={pointsToCanvas([drawingPoints[drawingPoints.length - 1], previewPoint], mapWidth, mapHeight)}
              stroke={tool === "drawRegion" ? "#b8d4ff" : tool === "drawArrow" ? "#ff9a8f" : "#ffe9a8"}
              strokeWidth={3}
              dash={[8, 8]}
              opacity={0.75}
              lineCap="round"
              lineJoin="round"
              listening={false}
            />
          )}

          {withoutSelected(project.sites, "site").map((site) => {
            const siteFrame = resolveSiteFrame(site, project.timeline.currentTime);
            const faction = project.factions.find((entry) => entry.id === siteFrame.effectiveFactionId);
            return <SitePiece key={site.id} site={site} color={faction?.color ?? "#8a96a8"} selected={isSelected("site", site.id)} mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectSingle("site", site.id)} onDragEnd={(x, y) => updateSite(site.id, { x, y })} />;
          })}

          {sitePlacementPreview && (
            <Group opacity={0.48} listening={false}>
              <SitePiece
                site={sitePlacementPreview.site}
                color={sitePlacementPreview.color}
                selected={false}
                mapWidth={mapWidth}
                mapHeight={mapHeight}
                onSelect={() => undefined}
                onDragEnd={() => undefined}
              />
            </Group>
          )}

          {withoutSelected(project.units, "unit").map((unit) => {
            const frame = resolveDisplayUnitFrame(unit);
            if (!frame) return null;
            const faction = project.factions.find((entry) => entry.id === frame.effectiveFactionId);
            return (
              <UnitPiece
                key={unit.id}
                unit={unit}
                frame={frame}
                color={faction?.color ?? "#8a96a8"}
                selected={isSelected("unit", unit.id)}
                mapWidth={mapWidth}
                mapHeight={mapHeight}
                onSelect={() => selectSingle("unit", unit.id)}
                onDragEnd={(x, y) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x, y, status: unit.status })}
                onRotateEnd={(rotation) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x: frame.x, y: frame.y, rotation, status: unit.status })}
              />
            );
          })}

          {unitPlacementPreview && (
            <Group opacity={0.48} listening={false}>
              <UnitPiece
                unit={unitPlacementPreview.unit}
                frame={unitPlacementPreview.frame}
                color={unitPlacementPreview.color}
                selected={false}
                mapWidth={mapWidth}
                mapHeight={mapHeight}
                onSelect={() => undefined}
                onDragEnd={() => undefined}
                onRotateEnd={() => undefined}
              />
            </Group>
          )}

          {withoutSelected(project.events, "event")
            .filter((event) => Math.abs(parseTimelineSeconds(event.time) - parseTimelineSeconds(project.timeline.currentTime)) < 0.25)
            .map((event) => (
              <EventMarker key={event.id} event={event} selected={isSelected("event", event.id)} mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectSingle("event", event.id)} />
            ))}

          {withoutSelected(project.labels, "label")
            .filter((label) => (!label.startTime || compareTime(label.startTime, project.timeline.currentTime) <= 0) && (!label.endTime || compareTime(label.endTime, project.timeline.currentTime) >= 0))
            .map((label) => (
              <LabelShape key={label.id} label={label} selected={isSelected("label", label.id)} mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectSingle("label", label.id)} onDragEnd={(x, y) => updateLabel(label.id, { x, y })} />
            ))}

          {labelPlacementPreview && (
            <Group opacity={0.48} listening={false}>
              <LabelShape
                label={labelPlacementPreview}
                selected={false}
                mapWidth={mapWidth}
                mapHeight={mapHeight}
                onSelect={() => undefined}
                onDragEnd={() => undefined}
              />
            </Group>
          )}

          {selectionRect && (
            <Rect
              x={selectionRect.x}
              y={selectionRect.y}
              width={selectionRect.width}
              height={selectionRect.height}
              fill="rgba(130, 167, 217, 0.12)"
              stroke="#82a7d9"
              strokeWidth={1.5}
              dash={[6, 5]}
              listening={false}
            />
          )}

          {!exportViewport &&
            frontSelectedItems.map((item) => {
              if (item.type === "region") {
                const region = project.regions.find((entry) => entry.id === item.id);
                if (!region || !shouldRenderRegion(region)) return null;
                const frame = resolveDisplayRegion(region);
                if (!frame) return null;
                const displayRegion = { ...region, points: multiDragDelta && isMultiSelected("region", region.id) ? frame.points.map((point) => offsetPoint(point)) : frame.points };
                return (
                  <RegionShape
                    key={`${region.id}-selected-front`}
                    region={displayRegion}
                    fillColor={regionFillColor(region)}
                    selected
                    editable={!region.locked}
                    mapWidth={mapWidth}
                    mapHeight={mapHeight}
                    maskPolygons={regionMaskPolygons(region.id)}
                    selectedPointIndices={multiSelected.length === 0 ? selectedRegionPointIndices : []}
                    onSelect={() => selectSingle("region", region.id)}
                    onPointSelect={(pointIndex) => toggleRegionPointSelection(region.id, pointIndex)}
                    onPointDragEnd={(pointIndex, x, y) => {
                      const points = frame.points.map((point, index) => (index === pointIndex ? { x, y } : point));
                      updateRegionPoints(region.id, points);
                    }}
                  />
                );
              }
              if (item.type === "line") {
                const line = project.lines.find((entry) => entry.id === item.id);
                if (!line) return null;
                const frame = resolveLineKeyframe(line, previewRouteTime("line", line.id) ?? project.timeline.currentTime, project.timeline.interpolationMode);
                if (!frame) return null;
                const displayFrame = multiDragDelta && isMultiSelected("line", line.id) ? { ...frame, points: frame.points.map((point) => offsetPoint(point)) } : frame;
                return (
                  <LineShape
                    key={`${line.id}-selected-front`}
                    line={line}
                    frame={displayFrame}
                    selected
                    preview={isPreviewRouteSource("line", line.id)}
                    selectedPointIndices={multiSelected.length === 0 ? selectedLinePointIndices : []}
                    mapWidth={mapWidth}
                    mapHeight={mapHeight}
                    onSelect={() => selectSingle("line", line.id)}
                    onPointSelect={(pointIndex) => toggleLinePointSelection(line.id, pointIndex)}
                    onPointDragEnd={(pointIndex, x, y) => {
                      const points = frame.points.map((point, index) => (index === pointIndex ? { x, y } : point));
                      updateLineKeyframe(line.id, project.timeline.currentTime, points);
                    }}
                  />
                );
              }
              if (item.type === "arrow") {
                const arrow = project.arrows.find((entry) => entry.id === item.id);
                const arrowFrameTime = arrow ? previewRouteTime("arrow", arrow.id) ?? project.timeline.currentTime : project.timeline.currentTime;
                if (!arrow || compareTime(arrow.startTime, arrowFrameTime) > 0 || compareTime(arrow.endTime, arrowFrameTime) < 0) return null;
                const frame = resolveArrowKeyframe(arrow, arrowFrameTime, project.timeline.interpolationMode);
                if (!frame) return null;
                const displayFrame = multiDragDelta && isMultiSelected("arrow", arrow.id) ? { ...frame, points: frame.points.map((point) => offsetPoint(point)) } : frame;
                return (
                  <ArrowShape
                    key={`${arrow.id}-selected-front`}
                    arrow={arrow}
                    frame={displayFrame}
                    selected
                    preview={isPreviewRouteSource("arrow", arrow.id)}
                    revealProgress={arrowRevealProgress(arrow, arrowFrameTime)}
                    selectedPointIndices={multiSelected.length === 0 ? selectedArrowPointIndices : []}
                    mapWidth={mapWidth}
                    mapHeight={mapHeight}
                    onSelect={() => selectSingle("arrow", arrow.id)}
                    onPointSelect={(pointIndex) => toggleArrowPointSelection(arrow.id, pointIndex)}
                    onPointDragEnd={(pointIndex, x, y) => {
                      const points = frame.points.map((point, index) => (index === pointIndex ? { x, y } : point));
                      updateArrowKeyframe(arrow.id, project.timeline.currentTime, points);
                    }}
                  />
                );
              }
              if (item.type === "site") {
                const site = project.sites.find((entry) => entry.id === item.id);
                if (!site) return null;
                const displaySite = multiDragDelta && isMultiSelected("site", site.id) ? offsetPoint(site) : site;
                const siteFrame = resolveSiteFrame(site, project.timeline.currentTime);
                const faction = project.factions.find((entry) => entry.id === siteFrame.effectiveFactionId);
                return <SitePiece key={`${site.id}-selected-front`} site={displaySite} color={faction?.color ?? "#8a96a8"} selected mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectSingle("site", site.id)} onDragEnd={(x, y) => updateSite(site.id, { x, y })} />;
              }
              if (item.type === "image") {
                const imageObject = project.images.find((entry) => entry.id === item.id);
                if (!imageObject) return null;
                const frame = resolvePlacedImageFrame(imageObject, project.timeline.currentTime, project.timeline.interpolationMode);
                const displayFrame = multiDragDelta && isMultiSelected("image", imageObject.id) ? offsetPoint(frame) : frame;
                return (
                  <PlacedImageShape
                    key={`${imageObject.id}-selected-front`}
                    imageObject={imageObject}
                    frame={displayFrame}
                    selected
                    mapWidth={mapWidth}
                    mapHeight={mapHeight}
                    onSelect={() => selectSingle("image", imageObject.id)}
                    onDragEnd={(x, y) => updateImageKeyframe(imageObject.id, project.timeline.currentTime, { x, y })}
                  />
                );
              }
              if (item.type === "label") {
                const label = project.labels.find((entry) => entry.id === item.id);
                if (!label || (label.startTime && compareTime(label.startTime, project.timeline.currentTime) > 0) || (label.endTime && compareTime(label.endTime, project.timeline.currentTime) < 0)) return null;
                const displayLabel = multiDragDelta && isMultiSelected("label", label.id) ? offsetPoint(label) : label;
                return <LabelShape key={`${label.id}-selected-front`} label={displayLabel} selected mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectSingle("label", label.id)} onDragEnd={(x, y) => updateLabel(label.id, { x, y })} />;
              }
              const unit = project.units.find((entry) => entry.id === item.id);
              if (!unit) return null;
              const frame = resolveDisplayUnitFrame(unit);
              if (!frame) return null;
              const displayFrame = multiDragDelta && isMultiSelected("unit", unit.id) ? offsetPoint(frame) : frame;
              const faction = project.factions.find((entry) => entry.id === frame.effectiveFactionId);
              return (
                <UnitPiece
                  key={`${unit.id}-selected-front`}
                  unit={unit}
                  frame={displayFrame}
                  color={faction?.color ?? "#8a96a8"}
                  selected
                  mapWidth={mapWidth}
                  mapHeight={mapHeight}
                  onSelect={() => selectSingle("unit", unit.id)}
                  onDragEnd={(x, y) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x, y, status: unit.status })}
                  onRotateEnd={(rotation) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x: frame.x, y: frame.y, rotation, status: unit.status })}
                />
              );
            })}

          {!exportViewport && multiSelected.length > 1 && selectedBounds && (
            <>
              <Rect
                x={selectedBounds.x - 10}
                y={selectedBounds.y - 10}
                width={selectedBounds.width + 20}
                height={selectedBounds.height + 20}
                fill="rgba(255,255,255,0.01)"
                draggable
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                }}
                onClick={(event) => {
                  event.cancelBubble = true;
                }}
                onDragStart={(event) => {
                  event.cancelBubble = true;
                  multiDragStartRef.current = { x: event.target.x(), y: event.target.y() };
                }}
                onDragMove={(event) => {
                  event.cancelBubble = true;
                  const start = multiDragStartRef.current ?? { x: selectedBounds.x - 10, y: selectedBounds.y - 10 };
                  setMultiDragDelta({ x: event.target.x() - start.x, y: event.target.y() - start.y });
                }}
                onDragEnd={(event) => {
                  event.cancelBubble = true;
                  const start = multiDragStartRef.current ?? { x: selectedBounds.x - 10, y: selectedBounds.y - 10 };
                  const delta = { x: event.target.x() - start.x, y: event.target.y() - start.y };
                  multiDragStartRef.current = null;
                  setMultiDragDelta(null);
                  moveSelectedItems(delta);
                }}
              />
              <MarchingAntsRect x={selectedBounds.x - 10} y={selectedBounds.y - 10} width={selectedBounds.width + 20} height={selectedBounds.height + 20} />
            </>
          )}

          {!exportViewport && selected.type === "event" &&
            (() => {
              const event = project.events.find((entry) => entry.id === selected.id);
              if (!event || Math.abs(parseTimelineSeconds(event.time) - parseTimelineSeconds(project.timeline.currentTime)) >= 0.25) return null;
              return <EventMarker key={`${event.id}-selected-front`} event={event} selected mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectSingle("event", event.id)} />;
            })()}

          {cameraLegendOverlay && (
            <Group x={cameraLegendOverlay.x} y={cameraLegendOverlay.y} scaleX={cameraLegendOverlay.scale} scaleY={cameraLegendOverlay.scale} listening={false}>
              {cameraLegendFactions.map((faction, index) => {
                const y = cameraLegendOverlay.paddingY + index * cameraLegendOverlay.rowHeight;
                return (
                  <Group key={`camera-faction-legend-${faction.id}`} y={y}>
                    <Circle
                      x={cameraLegendOverlay.paddingX + cameraLegendOverlay.radius}
                      y={cameraLegendOverlay.rowHeight / 2}
                      radius={cameraLegendOverlay.radius}
                      fill={faction.color}
                      stroke="#f8fafc"
                      strokeWidth={1}
                    />
                    <Text
                      x={cameraLegendOverlay.paddingX + cameraLegendOverlay.radius * 2 + cameraLegendOverlay.gap}
                      y={cameraLegendOverlay.textYOffset}
                      width={cameraLegendOverlay.textWidth}
                      height={cameraLegendOverlay.rowHeight}
                      text={faction.name}
                      fill="#f8fafc"
                      stroke={faction.cameraLegendTextOutlineColor ?? "#111827"}
                      strokeWidth={cameraLegendOverlay.textStrokeWidth}
                      fontSize={cameraLegendOverlay.fontSize}
                      fontFamily={'"Yu Gothic UI", "Meiryo", system-ui, sans-serif'}
                      fontStyle="bold"
                      verticalAlign="middle"
                    />
                  </Group>
                );
              })}
            </Group>
          )}

          {isMapImageEditing && mapImageRect && (
            <Group x={mapImageRect.x} y={mapImageRect.y}>
              <MarchingAntsRect x={0} y={0} width={mapImageRect.width} height={mapImageRect.height} />
              <Circle
                x={mapImageRect.width}
                y={mapImageRect.height}
                radius={8}
                fill="#f4d06f"
                stroke="#1b1f29"
                strokeWidth={2}
                draggable
                onMouseDown={(event) => {
                  event.cancelBubble = true;
                  mapImageResizeStartRef.current = { width: mapImageRect.width, height: mapImageRect.height };
                }}
                onDragStart={(event) => {
                  event.cancelBubble = true;
                  mapImageResizeStartRef.current = { width: mapImageRect.width, height: mapImageRect.height };
                }}
                onDragMove={(event) => {
                  event.cancelBubble = true;
                  const startSize = mapImageResizeStartRef.current ?? { width: mapImageRect.width, height: mapImageRect.height };
                  const diagonal = Math.hypot(startSize.width, startSize.height);
                  const nextScale = diagonal > 0 ? Math.max(16 / Math.max(startSize.width, startSize.height), Math.hypot(event.target.x(), event.target.y()) / diagonal) : 1;
                  const width = Math.max(16, startSize.width * nextScale);
                  const height = Math.max(16, startSize.height * nextScale);
                  event.target.position({ x: width, y: height });
                  setMapImageResizePreview({
                    width,
                    height,
                  });
                }}
                onDragEnd={(event) => {
                  event.cancelBubble = true;
                  const startSize = mapImageResizeStartRef.current ?? { width: mapImageRect.width, height: mapImageRect.height };
                  const diagonal = Math.hypot(startSize.width, startSize.height);
                  const nextScale = diagonal > 0 ? Math.max(16 / Math.max(startSize.width, startSize.height), Math.hypot(event.target.x(), event.target.y()) / diagonal) : 1;
                  const width = Math.max(16, startSize.width * nextScale);
                  setMapImageResizePreview(null);
                  mapImageResizeStartRef.current = null;
                  updateMapImagePlacement({ imageWidth: width });
                }}
              />
            </Group>
          )}
          {!exportViewport && (
            <Group>
              <Group x={cameraFrame.x} y={cameraFrame.y} listening={false}>
                {selected.type === "camera" ? (
                  <MarchingAntsRect x={0} y={0} width={cameraFrame.width} height={cameraFrame.height} />
                ) : (
                  <Rect
                    x={0}
                    y={0}
                    width={cameraFrame.width}
                    height={cameraFrame.height}
                    stroke="#f8fafc"
                    strokeWidth={2}
                    dash={[14, 8]}
                    opacity={0.65}
                    listening={false}
                  />
                )}
              </Group>
              {selected.type === "camera" && (
                <Group
                  x={cameraFrame.x}
                  y={cameraFrame.y}
                  draggable={tool === "select" && !spacePressed}
                  onClick={(event) => {
                    event.cancelBubble = true;
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                  }}
                  onDragStart={(event) => {
                    event.cancelBubble = true;
                    setCameraDragPreview({ x: resolvedCameraFrame.x, y: resolvedCameraFrame.y });
                  }}
                  onDragMove={(event) => {
                    event.cancelBubble = true;
                    setCameraDragPreview({
                      x: event.target.x(),
                      y: event.target.y(),
                    });
                  }}
                  onDragEnd={(event) => {
                    event.cancelBubble = true;
                    const nextX = event.target.x();
                    const nextY = event.target.y();
                    event.target.position({ x: nextX, y: nextY });
                    setCameraDragPreview(null);
                    updateCameraKeyframe(project.timeline.currentTime, { x: nextX, y: nextY });
                  }}
                >
                  <Line points={[0, 0, cameraFrame.width, 0]} stroke="#f4d06f" strokeWidth={24} opacity={0.01} hitStrokeWidth={32} />
                  <Line points={[cameraFrame.width, 0, cameraFrame.width, cameraFrame.height]} stroke="#f4d06f" strokeWidth={24} opacity={0.01} hitStrokeWidth={32} />
                  <Line points={[cameraFrame.width, cameraFrame.height, 0, cameraFrame.height]} stroke="#f4d06f" strokeWidth={24} opacity={0.01} hitStrokeWidth={32} />
                  <Line points={[0, cameraFrame.height, 0, 0]} stroke="#f4d06f" strokeWidth={24} opacity={0.01} hitStrokeWidth={32} />
                </Group>
              )}
              <Group
                x={cameraFrame.x + cameraHandleOffset.x}
                y={cameraFrame.y + cameraHandleOffset.y}
                draggable={tool === "select" && !spacePressed}
                onClick={(event) => {
                  event.cancelBubble = true;
                  selectSingle("camera", "exportCamera");
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  selectSingle("camera", "exportCamera");
                }}
                onDragStart={(event) => {
                  event.cancelBubble = true;
                  selectSingle("camera", "exportCamera");
                  setCameraDragPreview({ x: resolvedCameraFrame.x, y: resolvedCameraFrame.y });
                }}
                onDragMove={(event) => {
                  event.cancelBubble = true;
                  setCameraDragPreview({
                    x: event.target.x() - cameraHandleOffset.x,
                    y: event.target.y() - cameraHandleOffset.y,
                  });
                }}
                onDragEnd={(event) => {
                  event.cancelBubble = true;
                  const nextX = event.target.x() - cameraHandleOffset.x;
                  const nextY = event.target.y() - cameraHandleOffset.y;
                  event.target.position({ x: nextX + cameraHandleOffset.x, y: nextY + cameraHandleOffset.y });
                  setCameraDragPreview(null);
                  updateCameraKeyframe(project.timeline.currentTime, { x: nextX, y: nextY });
                }}
              >
                <Rect x={0} y={8} width={30} height={20} fill={selected.type === "camera" ? "#f4d06f" : "#f8fafc"} stroke="#1b1f29" strokeWidth={2} cornerRadius={4} />
                <Rect x={6} y={3} width={10} height={7} fill={selected.type === "camera" ? "#f4d06f" : "#f8fafc"} stroke="#1b1f29" strokeWidth={2} cornerRadius={2} />
                <Circle x={15} y={18} radius={6} fill="#1b1f29" stroke={selected.type === "camera" ? "#f4d06f" : "#f8fafc"} strokeWidth={2} />
              </Group>
            </Group>
          )}
          </Group>
        </Layer>
      </Stage>
      <div className="canvas-hint">
        {tool === "drawRegion" || tool === "drawLine" || tool === "drawArrow" ? "\u30af\u30ea\u30c3\u30af\u3067\u70b9\u3092\u8ffd\u52a0 / Enter\u3067\u78ba\u5b9a / Esc\u3067\u30ad\u30e3\u30f3\u30bb\u30eb" : "\u30db\u30a4\u30fc\u30eb\u3067\u30ba\u30fc\u30e0 / Space+\u30c9\u30e9\u30c3\u30b0\u3067\u30d1\u30f3 / \u30b3\u30de\u3092\u30c9\u30e9\u30c3\u30b0\u3067\u30ad\u30fc\u30d5\u30ec\u30fc\u30e0\u66f4\u65b0"}
      </div>
    </div>
  );
}
