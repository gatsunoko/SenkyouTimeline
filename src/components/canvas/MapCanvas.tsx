import { useEffect, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage } from "react-konva";
import type Konva from "konva";
import { useProjectStore } from "../../store/projectStore";
import type { Site, Unit } from "../../types/project";
import { canvasToRelative, MAP_HEIGHT, MAP_WIDTH, pointsToCanvas } from "../../utils/coordinate";
import { downloadBlob, downloadDataUrl } from "../../utils/fileIO";
import { getUnitRouteSegments, getUnitRouteTimeRange, resolveArrowKeyframe, resolveCameraFrame, resolveLineKeyframe, resolveSiteFrame, resolveUnitFrame, resolveUnitRouteApproachPoint, resolveUnitRoutePoint } from "../../utils/interpolation";
import { createZip, type ZipEntry } from "../../utils/zip";
import { compareTime, parseTimelineSeconds } from "../../utils/time";
import { ArrowShape } from "./ArrowShape";
import { EventMarker } from "./EventMarker";
import { LabelShape } from "./LabelShape";
import { LineShape } from "./LineShape";
import { SitePiece } from "./SitePiece";
import { UnitPiece } from "./UnitPiece";

type TimelineExportFormat = "png-sequence" | "jpeg-sequence" | "mp4";
type TimelineExportRequest = { format: TimelineExportFormat; fps: number };
type ExportViewport = { x: number; y: number; width: number; height: number; outputWidth: number; outputHeight: number };
type StillImageExportFormat = "png" | "jpeg";

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

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [stagePosition, setStagePosition] = useState({ x: 40, y: 30 });
  const [scale, setScale] = useState(0.58);
  const [exportViewport, setExportViewport] = useState<ExportViewport | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  const [mapImageResizePreview, setMapImageResizePreview] = useState<{ width: number; height: number } | null>(null);
  const [cameraDragPreview, setCameraDragPreview] = useState<{ x: number; y: number } | null>(null);
  const middlePanRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const mapImageResizeStartRef = useRef<{ width: number; height: number } | null>(null);
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);

  const project = useProjectStore((state) => state.project);
  const mapWidth = project.map.width ?? MAP_WIDTH;
  const mapHeight = project.map.height ?? MAP_HEIGHT;
  const selected = useProjectStore((state) => state.selected);
  const selectedLinePointIndices = useProjectStore((state) => state.selectedLinePointIndices);
  const selectedArrowPointIndices = useProjectStore((state) => state.selectedArrowPointIndices);
  const routePreviewUnitId = useProjectStore((state) => state.routePreviewUnitId);
  const unitPlacementAssetId = useProjectStore((state) => state.unitPlacementAssetId);
  const sitePlacementAssetId = useProjectStore((state) => state.sitePlacementAssetId);
  const tool = useProjectStore((state) => state.tool);
  const drawingPoints = useProjectStore((state) => state.drawingPoints);
  const selectObject = useProjectStore((state) => state.selectObject);
  const clearSelection = useProjectStore((state) => state.clearSelection);
  const toggleLinePointSelection = useProjectStore((state) => state.toggleLinePointSelection);
  const toggleArrowPointSelection = useProjectStore((state) => state.toggleArrowPointSelection);
  const updateUnitKeyframe = useProjectStore((state) => state.updateUnitKeyframe);
  const updateSite = useProjectStore((state) => state.updateSite);
  const updateLineKeyframe = useProjectStore((state) => state.updateLineKeyframe);
  const updateArrowKeyframe = useProjectStore((state) => state.updateArrowKeyframe);
  const updateLabel = useProjectStore((state) => state.updateLabel);
  const updateMapImagePlacement = useProjectStore((state) => state.updateMapImagePlacement);
  const updateCameraKeyframe = useProjectStore((state) => state.updateCameraKeyframe);
  const addUnit = useProjectStore((state) => state.addUnit);
  const duplicateUnitFromAsset = useProjectStore((state) => state.duplicateUnitFromAsset);
  const addSite = useProjectStore((state) => state.addSite);
  const duplicateSiteFromAsset = useProjectStore((state) => state.duplicateSiteFromAsset);
  const addLabel = useProjectStore((state) => state.addLabel);
  const addDrawingPoint = useProjectStore((state) => state.addDrawingPoint);

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
    if (!project.map.imageDataUrl) {
      setMapImage(null);
      return;
    }
    const image = new window.Image();
    image.onload = () => setMapImage(image);
    image.src = project.map.imageDataUrl;
  }, [project.map.imageDataUrl]);

  useEffect(() => {
    if (tool !== "addUnit" && tool !== "addSite" && tool !== "drawLine" && tool !== "drawArrow") setPreviewPoint(null);
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

  const pointerToRelative = () => {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return { x: 0.5, y: 0.5 };
    return canvasToRelative({
      x: (pointer.x - stagePosition.x) / scale,
      y: (pointer.y - stagePosition.y) / scale,
    }, mapWidth, mapHeight);
  };

  const updateDrawingPreview = () => {
    if (tool === "addUnit" || tool === "addSite") {
      setPreviewPoint(pointerToRelative());
      return;
    }
    if (tool !== "drawLine" && tool !== "drawArrow") return;
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
    const point = pointerToRelative();
    if (tool === "addUnit") {
      if (unitPlacementAssetId) duplicateUnitFromAsset(unitPlacementAssetId, point);
      else addUnit(point);
      return;
    }
    if (tool === "addSite") {
      if (sitePlacementAssetId) duplicateSiteFromAsset(sitePlacementAssetId, point);
      else addSite(point);
      return;
    }
    if (event.target !== event.target.getStage()) return;
    if (tool === "addLabel") {
      addLabel(point);
    } else if (tool === "drawLine" || tool === "drawArrow") {
      addDrawingPoint(point);
    } else if (tool === "mapImageEdit") {
      if (project.map.imageDataUrl) selectObject("mapImage", "mapImage");
    } else {
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
    if (exportViewport || selected.type !== type || !selected.id) return items;
    return items.filter((item) => item.id !== selected.id);
  };
  const isSelected = (type: typeof selected.type, id: string) => !exportViewport && selected.type === type && selected.id === id;
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
  const resolveDisplayUnitFrame = (unit: (typeof project.units)[number]) => {
    const routePoint = resolveUnitRoutePoint(unit, project.lines, project.arrows, project.timeline.currentTime, project.timeline.interpolationMode);
    const routeApproachPoint = routePoint ? null : resolveUnitRouteApproachPoint(unit, project.lines, project.arrows, project.timeline.currentTime, project.timeline.interpolationMode);
    const frame = resolveUnitFrame(unit, project.timeline.currentTime, project.timeline.interpolationMode);
    const effectiveRoutePoint = routePoint ?? routeApproachPoint;
    if (!frame && !effectiveRoutePoint) return null;
    if (!frame && effectiveRoutePoint) {
      const routeRange = getUnitRouteTimeRange(unit.route);
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
      shape: asset?.shape ?? "rectangle",
      assetId: asset?.id,
      iconUrl: asset?.imageDataUrl,
      showName: asset?.showName ?? true,
      nameTextColor: asset?.nameTextColor ?? "#f5efe3",
      nameBackgroundEnabled: asset?.nameBackgroundEnabled ?? false,
      nameBackgroundColor: asset?.nameBackgroundColor ?? "#111827",
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
    const previewSite: Site = {
      id: "site-placement-preview",
      name: asset?.name ?? "新規拠点",
      x: previewPoint.x,
      y: previewPoint.y,
      factionId: project.factions[0]?.id ?? "faction_default_a",
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
      iconUrl: asset?.imageDataUrl,
      keyframes: [],
    };
    return { site: previewSite, color: project.factions[0]?.color ?? "#8a96a8" };
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
          }
        }}
        onMouseUp={stopMiddlePan}
        onMouseLeave={() => {
          setPreviewPoint(null);
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
                selectObject("mapImage", "mapImage");
              }}
              onTap={(event) => {
                if (tool !== "mapImageEdit") return;
                event.cancelBubble = true;
                selectObject("mapImage", "mapImage");
              }}
              onDragEnd={(event) => {
                updateMapImagePlacement({ imageX: event.target.x(), imageY: event.target.y() });
              }}
            >
              <KonvaImage image={mapImage} width={mapImageRect.width} height={mapImageRect.height} opacity={0.95} listening={isMapImageEditing} />
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
                onSelect={() => selectObject("line", line.id)}
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
                selectedPointIndices={isSelected("arrow", arrow.id) ? selectedArrowPointIndices : []}
                mapWidth={mapWidth}
                mapHeight={mapHeight}
                onSelect={() => selectObject("arrow", arrow.id)}
                onPointSelect={(pointIndex) => toggleArrowPointSelection(arrow.id, pointIndex)}
                onPointDragEnd={(pointIndex, x, y) => {
                  const points = frame.points.map((point, index) => (index === pointIndex ? { x, y } : point));
                  updateArrowKeyframe(arrow.id, project.timeline.currentTime, points);
                }}
              />
            );
          })}

          {drawingPoints.length > 0 && (
            <Line
              points={pointsToCanvas(drawingPoints, mapWidth, mapHeight)}
              stroke={tool === "drawArrow" ? "#f46f5e" : "#f4d06f"}
              strokeWidth={4}
              dash={[10, 8]}
              lineCap="round"
              lineJoin="round"
            />
          )}

          {drawingPoints.length > 0 && previewPoint && (
            <Line
              points={pointsToCanvas([drawingPoints[drawingPoints.length - 1], previewPoint], mapWidth, mapHeight)}
              stroke={tool === "drawArrow" ? "#ff9a8f" : "#ffe9a8"}
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
            return <SitePiece key={site.id} site={site} color={faction?.color ?? "#8a96a8"} selected={isSelected("site", site.id)} mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectObject("site", site.id)} onDragEnd={(x, y) => updateSite(site.id, { x, y })} />;
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
                onSelect={() => selectObject("unit", unit.id)}
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
              <EventMarker key={event.id} event={event} selected={isSelected("event", event.id)} mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectObject("event", event.id)} />
            ))}

          {withoutSelected(project.labels, "label")
            .filter((label) => (!label.startTime || compareTime(label.startTime, project.timeline.currentTime) <= 0) && (!label.endTime || compareTime(label.endTime, project.timeline.currentTime) >= 0))
            .map((label) => (
              <LabelShape key={label.id} label={label} selected={isSelected("label", label.id)} mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectObject("label", label.id)} onDragEnd={(x, y) => updateLabel(label.id, { x, y })} />
            ))}

          {!exportViewport && selected.type === "line" &&
            (() => {
              const line = project.lines.find((entry) => entry.id === selected.id);
              if (!line) return null;
              const frame = resolveLineKeyframe(line, previewRouteTime("line", line.id) ?? project.timeline.currentTime, project.timeline.interpolationMode);
              if (!frame) return null;
              return (
                <LineShape
                  key={`${line.id}-selected-front`}
                  line={line}
                  frame={frame}
                  selected
                  preview={isPreviewRouteSource("line", line.id)}
                  selectedPointIndices={selectedLinePointIndices}
                  mapWidth={mapWidth}
                  mapHeight={mapHeight}
                  onSelect={() => selectObject("line", line.id)}
                  onPointSelect={(pointIndex) => toggleLinePointSelection(line.id, pointIndex)}
                  onPointDragEnd={(pointIndex, x, y) => {
                    const points = frame.points.map((point, index) => (index === pointIndex ? { x, y } : point));
                    updateLineKeyframe(line.id, project.timeline.currentTime, points);
                  }}
                />
              );
            })()}

          {!exportViewport && selected.type === "arrow" &&
            (() => {
              const arrow = project.arrows.find((entry) => entry.id === selected.id);
              const arrowFrameTime = arrow ? previewRouteTime("arrow", arrow.id) ?? project.timeline.currentTime : project.timeline.currentTime;
              if (!arrow || compareTime(arrow.startTime, arrowFrameTime) > 0 || compareTime(arrow.endTime, arrowFrameTime) < 0) return null;
              const frame = resolveArrowKeyframe(arrow, arrowFrameTime, project.timeline.interpolationMode);
              if (!frame) return null;
              return (
                <ArrowShape
                  key={`${arrow.id}-selected-front`}
                  arrow={arrow}
                  frame={frame}
                  selected
                  preview={isPreviewRouteSource("arrow", arrow.id)}
                  selectedPointIndices={selectedArrowPointIndices}
                  mapWidth={mapWidth}
                  mapHeight={mapHeight}
                  onSelect={() => selectObject("arrow", arrow.id)}
                  onPointSelect={(pointIndex) => toggleArrowPointSelection(arrow.id, pointIndex)}
                  onPointDragEnd={(pointIndex, x, y) => {
                    const points = frame.points.map((point, index) => (index === pointIndex ? { x, y } : point));
                    updateArrowKeyframe(arrow.id, project.timeline.currentTime, points);
                  }}
                />
              );
            })()}

          {!exportViewport && selected.type === "site" &&
            (() => {
              const site = project.sites.find((entry) => entry.id === selected.id);
              if (!site) return null;
              const siteFrame = resolveSiteFrame(site, project.timeline.currentTime);
              const faction = project.factions.find((entry) => entry.id === siteFrame.effectiveFactionId);
              return <SitePiece key={`${site.id}-selected-front`} site={site} color={faction?.color ?? "#8a96a8"} selected mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectObject("site", site.id)} onDragEnd={(x, y) => updateSite(site.id, { x, y })} />;
            })()}

          {!exportViewport && selected.type === "unit" &&
            (() => {
              const unit = project.units.find((entry) => entry.id === selected.id);
              if (!unit) return null;
              const frame = resolveDisplayUnitFrame(unit);
              if (!frame) return null;
              const faction = project.factions.find((entry) => entry.id === frame.effectiveFactionId);
              return (
                <UnitPiece
                  key={`${unit.id}-selected-front`}
                  unit={unit}
                  frame={frame}
                  color={faction?.color ?? "#8a96a8"}
                  selected
                  mapWidth={mapWidth}
                  mapHeight={mapHeight}
                  onSelect={() => selectObject("unit", unit.id)}
                  onDragEnd={(x, y) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x, y, status: unit.status })}
                  onRotateEnd={(rotation) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x: frame.x, y: frame.y, rotation, status: unit.status })}
                />
              );
            })()}

          {!exportViewport && selected.type === "event" &&
            (() => {
              const event = project.events.find((entry) => entry.id === selected.id);
              if (!event || Math.abs(parseTimelineSeconds(event.time) - parseTimelineSeconds(project.timeline.currentTime)) >= 0.25) return null;
              return <EventMarker key={`${event.id}-selected-front`} event={event} selected mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectObject("event", event.id)} />;
            })()}

          {!exportViewport && selected.type === "label" &&
            (() => {
              const label = project.labels.find((entry) => entry.id === selected.id);
              if (!label || (label.startTime && compareTime(label.startTime, project.timeline.currentTime) > 0) || (label.endTime && compareTime(label.endTime, project.timeline.currentTime) < 0)) return null;
              return <LabelShape key={`${label.id}-selected-front`} label={label} selected mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectObject("label", label.id)} onDragEnd={(x, y) => updateLabel(label.id, { x, y })} />;
            })()}
          {isMapImageEditing && mapImageRect && (
            <Group x={mapImageRect.x} y={mapImageRect.y}>
              <Rect x={0} y={0} width={mapImageRect.width} height={mapImageRect.height} stroke="#f4d06f" strokeWidth={2} dash={[8, 6]} listening={false} />
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
                <Rect
                  x={0}
                  y={0}
                  width={cameraFrame.width}
                  height={cameraFrame.height}
                  stroke={selected.type === "camera" ? "#f4d06f" : "#f8fafc"}
                  strokeWidth={selected.type === "camera" ? 3 : 2}
                  dash={[14, 8]}
                  opacity={selected.type === "camera" ? 1 : 0.65}
                  listening={false}
                />
                {selected.type === "camera" && (
                  <>
                    <Line points={[0, 0, 42, 0, 0, 0, 0, 42]} stroke="#f4d06f" strokeWidth={4} listening={false} />
                    <Line points={[cameraFrame.width, 0, cameraFrame.width - 42, 0, cameraFrame.width, 0, cameraFrame.width, 42]} stroke="#f4d06f" strokeWidth={4} listening={false} />
                    <Line points={[0, cameraFrame.height, 42, cameraFrame.height, 0, cameraFrame.height, 0, cameraFrame.height - 42]} stroke="#f4d06f" strokeWidth={4} listening={false} />
                    <Line points={[cameraFrame.width, cameraFrame.height, cameraFrame.width - 42, cameraFrame.height, cameraFrame.width, cameraFrame.height, cameraFrame.width, cameraFrame.height - 42]} stroke="#f4d06f" strokeWidth={4} listening={false} />
                  </>
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
                  selectObject("camera", "exportCamera");
                }}
                onTap={(event) => {
                  event.cancelBubble = true;
                  selectObject("camera", "exportCamera");
                }}
                onDragStart={(event) => {
                  event.cancelBubble = true;
                  selectObject("camera", "exportCamera");
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
        {tool === "drawLine" || tool === "drawArrow" ? "\u30af\u30ea\u30c3\u30af\u3067\u70b9\u3092\u8ffd\u52a0 / Enter\u3067\u78ba\u5b9a / Esc\u3067\u30ad\u30e3\u30f3\u30bb\u30eb" : "\u30db\u30a4\u30fc\u30eb\u3067\u30ba\u30fc\u30e0 / Space+\u30c9\u30e9\u30c3\u30b0\u3067\u30d1\u30f3 / \u30b3\u30de\u3092\u30c9\u30e9\u30c3\u30b0\u3067\u30ad\u30fc\u30d5\u30ec\u30fc\u30e0\u66f4\u65b0"}
      </div>
    </div>
  );
}
