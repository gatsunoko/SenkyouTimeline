import { useEffect, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Line, Rect, Stage } from "react-konva";
import type Konva from "konva";
import { useProjectStore } from "../../store/projectStore";
import { canvasToRelative, MAP_HEIGHT, MAP_WIDTH, pointsToCanvas } from "../../utils/coordinate";
import { downloadBlob, downloadDataUrl } from "../../utils/fileIO";
import { getUnitRouteSegments, getUnitRouteTimeRange, resolveArrowKeyframe, resolveLineKeyframe, resolveSiteFrame, resolveUnitFrame, resolveUnitRoutePoint } from "../../utils/interpolation";
import { createZip, type ZipEntry } from "../../utils/zip";
import { compareTime, parseTimelineSeconds } from "../../utils/time";
import { ArrowShape } from "./ArrowShape";
import { EventMarker } from "./EventMarker";
import { LabelShape } from "./LabelShape";
import { LineShape } from "./LineShape";
import { SitePiece } from "./SitePiece";
import { UnitPiece } from "./UnitPiece";

type TimelineExportFormat = "png-sequence" | "mp4";
type TimelineExportRequest = { format: TimelineExportFormat; fps: number };
type CanvasStreamTrack = MediaStreamTrack & { requestFrame?: () => void };

const mp4MimeTypes = ["video/mp4", "video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=h264"];

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

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

function loadDataUrlImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("\u753b\u50cf\u306e\u8aad\u307f\u8fbc\u307f\u306b\u5931\u6557\u3057\u307e\u3057\u305f"));
    image.src = dataUrl;
  });
}

function mp4MimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return mp4MimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function dispatchExportStatus(message: string, busy: boolean) {
  window.dispatchEvent(new CustomEvent("sengoku-export-status", { detail: { message, busy } }));
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [stagePosition, setStagePosition] = useState({ x: 40, y: 30 });
  const [scale, setScale] = useState(0.58);
  const [spacePressed, setSpacePressed] = useState(false);
  const [middlePanning, setMiddlePanning] = useState(false);
  const [previewPoint, setPreviewPoint] = useState<{ x: number; y: number } | null>(null);
  const middlePanRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);

  const project = useProjectStore((state) => state.project);
  const mapWidth = project.map.width ?? MAP_WIDTH;
  const mapHeight = project.map.height ?? MAP_HEIGHT;
  const selected = useProjectStore((state) => state.selected);
  const selectedLinePointIndices = useProjectStore((state) => state.selectedLinePointIndices);
  const selectedArrowPointIndices = useProjectStore((state) => state.selectedArrowPointIndices);
  const routePreviewUnitId = useProjectStore((state) => state.routePreviewUnitId);
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
  const addUnit = useProjectStore((state) => state.addUnit);
  const addSite = useProjectStore((state) => state.addSite);
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
    if (tool !== "drawLine" && tool !== "drawArrow") setPreviewPoint(null);
  }, [tool]);

  useEffect(() => {
    if (drawingPoints.length === 0) setPreviewPoint(null);
  }, [drawingPoints.length]);

  useEffect(() => {
    const exportHandler = () => {
      const sourceProject = useProjectStore.getState().project;
      const exportWidth = Math.max(1, Math.round(sourceProject.map.width ?? MAP_WIDTH));
      const exportHeight = Math.max(1, Math.round(sourceProject.map.height ?? MAP_HEIGHT));
      void captureDataUrl(exportWidth, exportHeight)
        .then((dataUrl) => downloadDataUrl(dataUrl, "sengoku-battle-map.png"))
        .catch((error) => {
          const message = error instanceof Error ? error.message : "\u66f8\u304d\u51fa\u3057\u306b\u5931\u6557\u3057\u307e\u3057\u305f";
          dispatchExportStatus(message, false);
          window.alert(message);
        });
    };
    const timelineExportHandler = (event: Event) => {
      const detail = (event as CustomEvent<TimelineExportRequest>).detail;
      void exportTimeline(detail);
    };
    const resetHandler = () => {
      setScale(0.58);
      setStagePosition({ x: 40, y: 30 });
    };

    const captureDataUrl = async (width: number, height: number) => {
      const stage = stageRef.current;
      if (!stage) throw new Error("\u30ad\u30e3\u30f3\u30d0\u30b9\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093");
      await waitForPaint();
      const original = {
        width: stage.width(),
        height: stage.height(),
        x: stage.x(),
        y: stage.y(),
        scaleX: stage.scaleX(),
        scaleY: stage.scaleY(),
      };
      try {
        stage.width(width);
        stage.height(height);
        stage.x(0);
        stage.y(0);
        stage.scale({ x: 1, y: 1 });
        stage.batchDraw();
        await waitForPaint();
        return stage.toDataURL({ x: 0, y: 0, width, height, pixelRatio: 1, mimeType: "image/png" });
      } finally {
        stage.width(original.width);
        stage.height(original.height);
        stage.x(original.x);
        stage.y(original.y);
        stage.scale({ x: original.scaleX, y: original.scaleY });
        stage.batchDraw();
      }
    };

    const exportTimeline = async (request: TimelineExportRequest) => {
      const stage = stageRef.current;
      if (!stage) return;

      const fps = clampExportFps(request.fps);
      const state = useProjectStore.getState();
      const sourceProject = state.project;
      const originalTime = sourceProject.timeline.currentTime;
      const exportWidth = Math.max(1, Math.round(sourceProject.map.width ?? MAP_WIDTH));
      const exportHeight = Math.max(1, Math.round(sourceProject.map.height ?? MAP_HEIGHT));
      const bounds = getTimelineExportBounds(sourceProject);
      const times = buildExportTimes(bounds.start, bounds.end, fps);
      const basename = safeFilename(sourceProject.projectName);
      const pad = Math.max(4, String(times.length).length);

      try {
        if (request.format === "png-sequence") {
          const entries: ZipEntry[] = [];
          for (let index = 0; index < times.length; index += 1) {
            useProjectStore.getState().setCurrentTime(times[index].toFixed(4));
            const dataUrl = await captureDataUrl(exportWidth, exportHeight);
            entries.push({
              name: `${basename}_${String(index + 1).padStart(pad, "0")}.png`,
              data: await dataUrlToBytes(dataUrl),
            });
            dispatchExportStatus(`PNG\u66f8\u304d\u51fa\u3057\u4e2d ${index + 1}/${times.length}`, true);
          }
          dispatchExportStatus("ZIP\u4f5c\u6210\u4e2d", true);
          downloadBlob(createZip(entries), `${basename}_${fps}fps_png_sequence.zip`);
          dispatchExportStatus(`PNG\u9023\u756a\u3092\u66f8\u304d\u51fa\u3057\u307e\u3057\u305f (${times.length}\u679a)`, false);
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

        const stream = exportCanvas.captureStream(0);
        const [track] = stream.getVideoTracks() as CanvasStreamTrack[];
        const chunks: BlobPart[] = [];
        const recorder = new MediaRecorder(stream, { mimeType });
        const stopped = new Promise<void>((resolve, reject) => {
          recorder.onstop = () => resolve();
          recorder.onerror = () => reject(new Error("MP4\u66f8\u304d\u51fa\u3057\u306b\u5931\u6557\u3057\u307e\u3057\u305f"));
        });
        recorder.ondataavailable = (recordedEvent) => {
          if (recordedEvent.data.size > 0) chunks.push(recordedEvent.data);
        };

        recorder.start();
        await sleep(100);
        for (let index = 0; index < times.length; index += 1) {
          useProjectStore.getState().setCurrentTime(times[index].toFixed(4));
          const image = await loadDataUrlImage(await captureDataUrl(exportWidth, exportHeight));
          context.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
          context.drawImage(image, 0, 0, exportCanvas.width, exportCanvas.height);
          track.requestFrame?.();
          dispatchExportStatus(`MP4\u66f8\u304d\u51fa\u3057\u4e2d ${index + 1}/${times.length}`, true);
          await sleep(1000 / fps);
        }
        recorder.stop();
        await stopped;
        track.stop();
        downloadBlob(new Blob(chunks, { type: mimeType }), `${basename}_${fps}fps.mp4`);
        dispatchExportStatus("MP4\u3092\u66f8\u304d\u51fa\u3057\u307e\u3057\u305f", false);
      } catch (error) {
        const message = error instanceof Error ? error.message : "\u66f8\u304d\u51fa\u3057\u306b\u5931\u6557\u3057\u307e\u3057\u305f";
        dispatchExportStatus(message, false);
        window.alert(message);
      } finally {
        useProjectStore.getState().setCurrentTime(originalTime);
      }
    };

    window.addEventListener("sengoku-export-png", exportHandler);
    window.addEventListener("sengoku-export-timeline", timelineExportHandler);
    window.addEventListener("sengoku-reset-view", resetHandler);
    return () => {
      window.removeEventListener("sengoku-export-png", exportHandler);
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
    setMiddlePanning(false);
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
    if (event.target !== event.target.getStage()) return;
    const point = pointerToRelative();
    if (tool === "addUnit") {
      addUnit(point);
    } else if (tool === "addSite") {
      addSite(point);
    } else if (tool === "addLabel") {
      addLabel(point);
    } else if (tool === "drawLine" || tool === "drawArrow") {
      addDrawingPoint(point);
    } else {
      clearSelection();
    }
  };

  const gridLines = [];
  for (let x = 0; x <= mapWidth; x += 80) gridLines.push(<Line key={`x${x}`} points={[x, 0, x, mapHeight]} stroke="#273241" strokeWidth={1} listening={false} />);
  for (let y = 0; y <= mapHeight; y += 80) gridLines.push(<Line key={`y${y}`} points={[0, y, mapWidth, y]} stroke="#273241" strokeWidth={1} listening={false} />);

  const mapImageRect = (() => {
    if (!mapImage?.naturalWidth || !mapImage.naturalHeight) return null;
    const imageAspect = mapImage.naturalWidth / mapImage.naturalHeight;
    const canvasAspect = mapWidth / mapHeight;
    if (imageAspect > canvasAspect) {
      const width = mapWidth;
      const height = mapWidth / imageAspect;
      return { x: 0, y: (mapHeight - height) / 2, width, height };
    }
    const height = mapHeight;
    const width = mapHeight * imageAspect;
    return { x: (mapWidth - width) / 2, y: 0, width, height };
  })();

  const withoutSelected = <T extends { id: string }>(items: T[], type: typeof selected.type) => {
    if (selected.type !== type || !selected.id) return items;
    return items.filter((item) => item.id !== selected.id);
  };
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
    const frame = resolveUnitFrame(unit, project.timeline.currentTime, project.timeline.interpolationMode);
    if (!frame && !routePoint) return null;
    if (!frame && routePoint) {
      const routeRange = getUnitRouteTimeRange(unit.route);
      const displayStartTime = unit.displayStartTime ?? routeRange?.startTime;
      const displayEndTime = unit.displayEndTime;
      if (displayStartTime && compareTime(project.timeline.currentTime, displayStartTime) < 0) return null;
      if (displayEndTime && compareTime(project.timeline.currentTime, displayEndTime) > 0) return null;
      return {
        time: project.timeline.currentTime,
        displayDate: project.timeline.frames.find((entry) => entry.time === project.timeline.currentTime)?.displayDate ?? project.timeline.currentTime,
        x: routePoint.x,
        y: routePoint.y,
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
    return routePoint ? { ...frame, x: routePoint.x, y: routePoint.y } : frame;
  };

  return (
    <div className="canvas-container" ref={containerRef}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onWheel={onWheel}
        onClick={onCanvasClick}
        onTap={onCanvasClick}
        onMouseMove={onStageMouseMove}
        draggable={spacePressed}
        x={stagePosition.x}
        y={stagePosition.y}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={(event) => {
          if (event.evt.button === 1) {
            event.evt.preventDefault();
            middlePanRef.current = { active: true, x: event.evt.clientX, y: event.evt.clientY };
            setMiddlePanning(true);
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
          <Rect x={0} y={0} width={mapWidth} height={mapHeight} fill="#16202b" stroke="#465061" strokeWidth={2} listening={false} />
          {mapImage && mapImageRect ? (
            <KonvaImage image={mapImage} x={mapImageRect.x} y={mapImageRect.y} width={mapImageRect.width} height={mapImageRect.height} opacity={0.95} listening={false} />
          ) : (
            <>
              <Rect x={0} y={0} width={mapWidth} height={mapHeight} fill="#192332" listening={false} />
              {gridLines}
            </>
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
                selected={selected.type === "line" && selected.id === line.id}
                preview={isPreviewRouteSource("line", line.id)}
                selectedPointIndices={selected.type === "line" && selected.id === line.id ? selectedLinePointIndices : []}
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
                selected={selected.type === "arrow" && selected.id === arrow.id}
                preview={isPreviewRouteSource("arrow", arrow.id)}
                selectedPointIndices={selected.type === "arrow" && selected.id === arrow.id ? selectedArrowPointIndices : []}
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
            return <SitePiece key={site.id} site={site} color={faction?.color ?? "#8a96a8"} selected={selected.type === "site" && selected.id === site.id} mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectObject("site", site.id)} onDragEnd={(x, y) => updateSite(site.id, { x, y })} />;
          })}

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
                selected={selected.type === "unit" && selected.id === unit.id}
                mapWidth={mapWidth}
                mapHeight={mapHeight}
                onSelect={() => selectObject("unit", unit.id)}
                onDragEnd={(x, y) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x, y, status: unit.status })}
              />
            );
          })}

          {withoutSelected(project.events, "event")
            .filter((event) => Math.abs(parseTimelineSeconds(event.time) - parseTimelineSeconds(project.timeline.currentTime)) < 0.25)
            .map((event) => (
              <EventMarker key={event.id} event={event} selected={selected.type === "event" && selected.id === event.id} mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectObject("event", event.id)} />
            ))}

          {withoutSelected(project.labels, "label")
            .filter((label) => (!label.startTime || compareTime(label.startTime, project.timeline.currentTime) <= 0) && (!label.endTime || compareTime(label.endTime, project.timeline.currentTime) >= 0))
            .map((label) => (
              <LabelShape key={label.id} label={label} selected={selected.type === "label" && selected.id === label.id} mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectObject("label", label.id)} onDragEnd={(x, y) => updateLabel(label.id, { x, y })} />
            ))}

          {selected.type === "line" &&
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

          {selected.type === "arrow" &&
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

          {selected.type === "site" &&
            (() => {
              const site = project.sites.find((entry) => entry.id === selected.id);
              if (!site) return null;
              const siteFrame = resolveSiteFrame(site, project.timeline.currentTime);
              const faction = project.factions.find((entry) => entry.id === siteFrame.effectiveFactionId);
              return <SitePiece key={`${site.id}-selected-front`} site={site} color={faction?.color ?? "#8a96a8"} selected mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectObject("site", site.id)} onDragEnd={(x, y) => updateSite(site.id, { x, y })} />;
            })()}

          {selected.type === "unit" &&
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
                />
              );
            })()}

          {selected.type === "event" &&
            (() => {
              const event = project.events.find((entry) => entry.id === selected.id);
              if (!event || Math.abs(parseTimelineSeconds(event.time) - parseTimelineSeconds(project.timeline.currentTime)) >= 0.25) return null;
              return <EventMarker key={`${event.id}-selected-front`} event={event} selected mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectObject("event", event.id)} />;
            })()}

          {selected.type === "label" &&
            (() => {
              const label = project.labels.find((entry) => entry.id === selected.id);
              if (!label || (label.startTime && compareTime(label.startTime, project.timeline.currentTime) > 0) || (label.endTime && compareTime(label.endTime, project.timeline.currentTime) < 0)) return null;
              return <LabelShape key={`${label.id}-selected-front`} label={label} selected mapWidth={mapWidth} mapHeight={mapHeight} onSelect={() => selectObject("label", label.id)} onDragEnd={(x, y) => updateLabel(label.id, { x, y })} />;
            })()}
        </Layer>
      </Stage>
      <div className="canvas-hint">
        {tool === "drawLine" || tool === "drawArrow" ? "\u30af\u30ea\u30c3\u30af\u3067\u70b9\u3092\u8ffd\u52a0 / Enter\u3067\u78ba\u5b9a / Esc\u3067\u30ad\u30e3\u30f3\u30bb\u30eb" : "\u30db\u30a4\u30fc\u30eb\u3067\u30ba\u30fc\u30e0 / Space+\u30c9\u30e9\u30c3\u30b0\u3067\u30d1\u30f3 / \u30b3\u30de\u3092\u30c9\u30e9\u30c3\u30b0\u3067\u30ad\u30fc\u30d5\u30ec\u30fc\u30e0\u66f4\u65b0"}
      </div>
    </div>
  );
}
