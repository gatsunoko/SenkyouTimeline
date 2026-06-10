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
}

export function LineShape({ line, frame, selected, preview = false, selectedPointIndices = [], mapWidth, mapHeight, onSelect, onPointSelect, onPointDragEnd }: LineShapeProps) {
  const [dragPoints, setDragPoints] = useState<MapPoint[] | null>(null);
  const { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton } = usePrimaryButtonDrag();
  const activePoints = dragPoints ?? frame.points;
  const tension = line.curveMode === "curve" ? 0.45 : 0;
  const canvasPoints = pointsToCanvas(activePoints, mapWidth, mapHeight);

  useEffect(() => {
    setDragPoints(null);
  }, [frame.time, frame.points]);

  if (frame.points.length < 2) return null;
  return (
    <>
      <Line
        points={pointsToCanvas(activePoints, mapWidth, mapHeight)}
        stroke="rgba(255,255,255,0.01)"
        strokeWidth={Math.max(18, line.width + 14)}
        opacity={0.01}
        lineCap="round"
        lineJoin="round"
        tension={tension}
        onClick={onSelect}
        onTap={onSelect}
      />
      {selected && <MarchingAntsLine points={canvasPoints} strokeWidth={line.width + 8} lineCap="round" lineJoin="round" tension={tension} />}
      <Line
        points={canvasPoints}
        stroke={preview ? "#f0c665" : line.color}
        strokeWidth={preview ? line.width + 2 : line.width}
        opacity={preview ? Math.max(0.9, line.opacity) : line.opacity}
        dash={line.dashed ? [16, 10] : undefined}
        lineCap="round"
        lineJoin="round"
        tension={tension}
        onClick={onSelect}
        onTap={onSelect}
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
              draggable={!line.locked}
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
