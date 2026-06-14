import { Circle, Line } from "react-konva";
import { useEffect, useState } from "react";
import type { BattleLine, LineKeyframe } from "../../types/project";
import type { MapPoint } from "../../types/project";
import { canvasToRelative, relativeToCanvas, pointsToCanvas } from "../../utils/coordinate";
import { MarchingAntsLine } from "./SelectionMarchingAnts";
import { usePrimaryButtonDrag } from "./usePrimaryButtonDrag";

interface LineShapeProps {
  line: BattleLine;
  frame: LineKeyframe;
  selected: boolean;
  mapWidth: number;
  mapHeight: number;
  onSelect: () => void;
  preview?: boolean;
  selectedPointIndices?: number[];
  onPointSelect?: (pointIndex: number) => void;
  onPointDragEnd?: (pointIndex: number, x: number, y: number) => void;
  dragEnabled?: boolean;
}

export function LineShape({ line, frame, selected, preview = false, selectedPointIndices = [], mapWidth, mapHeight, onSelect, onPointSelect, onPointDragEnd, dragEnabled = true }: LineShapeProps) {
  const [dragPoints, setDragPoints] = useState<MapPoint[] | null>(null);
  const { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton } = usePrimaryButtonDrag();
  const activePoints = dragPoints ?? frame.points;
  const tension = line.curveMode === "curve" ? 0.45 : 0;
  const canvasPoints = pointsToCanvas(activePoints, mapWidth, mapHeight);
  const interactive = !line.locked;
  const outlineWidth = line.outlineEnabled ? Math.max(0, line.outlineWidth ?? 4) : 0;
  const outlineColor = line.outlineColor ?? "#111827";
  const displayStrokeWidth = preview ? line.width + 2 : line.width;
  const displayOpacity = preview ? Math.max(0.9, line.opacity) : line.opacity;
  const displayColor = preview ? "#f0c665" : line.color;

  useEffect(() => {
    setDragPoints(null);
  }, [frame.time, frame.points]);

  if (frame.points.length < 2) return null;
  return (
    <>
      <Line
        points={pointsToCanvas(activePoints, mapWidth, mapHeight)}
        stroke="rgba(255,255,255,0.01)"
        strokeWidth={Math.max(18, displayStrokeWidth + outlineWidth * 2 + 14)}
        opacity={0.01}
        lineCap="round"
        lineJoin="round"
        tension={tension}
        listening={interactive}
        onClick={interactive ? onSelect : undefined}
        onTap={interactive ? onSelect : undefined}
      />
      {selected && <MarchingAntsLine points={canvasPoints} strokeWidth={displayStrokeWidth + outlineWidth * 2 + 8} lineCap="round" lineJoin="round" tension={tension} />}
      {outlineWidth > 0 && (
        <Line
          points={canvasPoints}
          stroke={outlineColor}
          strokeWidth={displayStrokeWidth + outlineWidth * 2}
          opacity={displayOpacity}
          dash={line.dashed ? [16, 10] : undefined}
          lineCap="round"
          lineJoin="round"
          tension={tension}
          listening={false}
        />
      )}
      <Line
        points={canvasPoints}
        stroke={displayColor}
        strokeWidth={displayStrokeWidth}
        opacity={displayOpacity}
        dash={line.dashed ? [16, 10] : undefined}
        lineCap="round"
        lineJoin="round"
        tension={tension}
        listening={interactive}
        onClick={interactive ? onSelect : undefined}
        onTap={interactive ? onSelect : undefined}
      />
      {selected &&
        activePoints.map((point, index) => {
          const position = relativeToCanvas(point, mapWidth, mapHeight);
          const pointSelected = selectedPointIndices.includes(index);
          return (
            <Circle
              key={`${line.id}-point-${index}`}
              x={position.x}
              y={position.y}
              radius={pointSelected ? 11 : 8}
              fill={pointSelected ? "#ffffff" : "#f4d06f"}
              stroke={pointSelected ? "#f46f5e" : "#1b1f29"}
              strokeWidth={pointSelected ? 3 : 2}
              hitStrokeWidth={14}
              listening={interactive}
              draggable={dragEnabled && interactive}
              onMouseDown={updateDragButton}
              onClick={(event) => {
                event.cancelBubble = true;
                onPointSelect?.(index);
              }}
              onTap={(event) => {
                event.cancelBubble = true;
                onPointSelect?.(index);
              }}
              onDragStart={stopBlockedDrag}
              dragBoundFunc={(nextPosition) => (isDragAllowed() ? nextPosition : position)}
              onDragMove={(event) => {
                if (!isDragAllowed()) return;
                const nextPoint = canvasToRelative({ x: event.target.x(), y: event.target.y() }, mapWidth, mapHeight);
                setDragPoints(activePoints.map((currentPoint, pointIndex) => (pointIndex === index ? nextPoint : currentPoint)));
              }}
              onDragEnd={(event) => {
                if (!isDragAllowed()) {
                  event.target.position(position);
                  setDragPoints(null);
                  resetDragButton();
                  return;
                }
                const nextPoint = canvasToRelative({ x: event.target.x(), y: event.target.y() }, mapWidth, mapHeight);
                setDragPoints(null);
                resetDragButton();
                onPointDragEnd?.(index, nextPoint.x, nextPoint.y);
              }}
            />
          );
        })}
    </>
  );
}
