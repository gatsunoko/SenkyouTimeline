import { useEffect, useRef, useState } from "react";
import { Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import type Konva from "konva";
import { useProjectStore } from "../../store/projectStore";
import { canvasToRelative, MAP_HEIGHT, MAP_WIDTH, pointsToCanvas } from "../../utils/coordinate";
import { exportStageToPng } from "../../utils/exportImage";
import { resolveLineKeyframe, resolveUnitFrame } from "../../utils/interpolation";
import { ArrowShape } from "./ArrowShape";
import { EventMarker } from "./EventMarker";
import { LabelShape } from "./LabelShape";
import { LineShape } from "./LineShape";
import { SitePiece } from "./SitePiece";
import { UnitPiece } from "./UnitPiece";

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 900, height: 560 });
  const [stagePosition, setStagePosition] = useState({ x: 40, y: 30 });
  const [scale, setScale] = useState(0.58);
  const [spacePressed, setSpacePressed] = useState(false);
  const [middlePanning, setMiddlePanning] = useState(false);
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);

  const project = useProjectStore((state) => state.project);
  const selected = useProjectStore((state) => state.selected);
  const tool = useProjectStore((state) => state.tool);
  const drawingPoints = useProjectStore((state) => state.drawingPoints);
  const selectObject = useProjectStore((state) => state.selectObject);
  const clearSelection = useProjectStore((state) => state.clearSelection);
  const updateUnitKeyframe = useProjectStore((state) => state.updateUnitKeyframe);
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
    const exportHandler = () => {
      if (stageRef.current) exportStageToPng(stageRef.current, "sengoku-battle-map.png");
    };
    const resetHandler = () => {
      setScale(0.58);
      setStagePosition({ x: 40, y: 30 });
    };
    window.addEventListener("sengoku-export-png", exportHandler);
    window.addEventListener("sengoku-reset-view", resetHandler);
    return () => {
      window.removeEventListener("sengoku-export-png", exportHandler);
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
    });
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
  for (let x = 0; x <= MAP_WIDTH; x += 80) gridLines.push(<Line key={`x${x}`} points={[x, 0, x, MAP_HEIGHT]} stroke="#273241" strokeWidth={1} listening={false} />);
  for (let y = 0; y <= MAP_HEIGHT; y += 80) gridLines.push(<Line key={`y${y}`} points={[0, y, MAP_WIDTH, y]} stroke="#273241" strokeWidth={1} listening={false} />);

  return (
    <div className="canvas-container" ref={containerRef}>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onWheel={onWheel}
        onClick={onCanvasClick}
        onTap={onCanvasClick}
        draggable={spacePressed || middlePanning}
        x={stagePosition.x}
        y={stagePosition.y}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={(event) => {
          if (event.evt.button === 1) {
            event.evt.preventDefault();
            setMiddlePanning(true);
          }
        }}
        onMouseUp={() => setMiddlePanning(false)}
        onMouseLeave={() => setMiddlePanning(false)}
        onDragEnd={(event) => setStagePosition({ x: event.target.x(), y: event.target.y() })}
      >
        <Layer>
          <Rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill="#16202b" stroke="#465061" strokeWidth={2} listening={false} />
          {mapImage ? (
            <KonvaImage image={mapImage} x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} opacity={0.95} listening={false} />
          ) : (
            <>
              <Rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill="#192332" listening={false} />
              {gridLines}
              <Text text="地図画像なし: 仮グリッド背景" x={40} y={35} fontSize={28} fill="#7f8da3" listening={false} />
            </>
          )}

          {project.lines.map((line) => {
            const frame = resolveLineKeyframe(line, project.timeline.currentTime);
            if (!line.visible || !frame) return null;
            return <LineShape key={line.id} line={line} frame={frame} selected={selected.type === "line" && selected.id === line.id} onSelect={() => selectObject("line", line.id)} />;
          })}

          {project.arrows.map((arrow) => (
            <ArrowShape key={arrow.id} arrow={arrow} selected={selected.type === "arrow" && selected.id === arrow.id} onSelect={() => selectObject("arrow", arrow.id)} />
          ))}

          {drawingPoints.length > 0 && (
            <Line
              points={pointsToCanvas(drawingPoints)}
              stroke={tool === "drawArrow" ? "#f46f5e" : "#f4d06f"}
              strokeWidth={4}
              dash={[10, 8]}
              lineCap="round"
              lineJoin="round"
            />
          )}

          {project.sites.map((site) => {
            const faction = project.factions.find((entry) => entry.id === site.factionId);
            if (!site.visible) return null;
            return <SitePiece key={site.id} site={site} color={faction?.color ?? "#8a96a8"} selected={selected.type === "site" && selected.id === site.id} onSelect={() => selectObject("site", site.id)} />;
          })}

          {project.units.map((unit) => {
            const frame = resolveUnitFrame(unit, project.timeline.currentTime, project.timeline.interpolationMode);
            if (!unit.visible || !frame?.visible) return null;
            const faction = project.factions.find((entry) => entry.id === frame.effectiveFactionId);
            return (
              <UnitPiece
                key={unit.id}
                unit={unit}
                frame={frame}
                color={faction?.color ?? "#8a96a8"}
                selected={selected.type === "unit" && selected.id === unit.id}
                onSelect={() => selectObject("unit", unit.id)}
                onDragEnd={(x, y) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x, y, visible: true, status: unit.status })}
              />
            );
          })}

          {project.events
            .filter((event) => event.time === project.timeline.currentTime)
            .map((event) => (
              <EventMarker key={event.id} event={event} selected={selected.type === "event" && selected.id === event.id} onSelect={() => selectObject("event", event.id)} />
            ))}

          {project.labels
            .filter((label) => (!label.startTime || label.startTime <= project.timeline.currentTime) && (!label.endTime || label.endTime >= project.timeline.currentTime))
            .map((label) => (
              <LabelShape key={label.id} label={label} selected={selected.type === "label" && selected.id === label.id} onSelect={() => selectObject("label", label.id)} />
            ))}
        </Layer>
      </Stage>
      <div className="canvas-hint">
        {tool === "drawLine" || tool === "drawArrow" ? "クリックで点を追加 / Enterで確定 / Escでキャンセル" : "ホイールでズーム / Space+ドラッグでパン / コマをドラッグでキーフレーム更新"}
      </div>
    </div>
  );
}
