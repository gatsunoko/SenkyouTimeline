import { useEffect, useState } from "react";
import { Arrow, Circle } from "react-konva";
import type { ArrowKeyframe, BattleArrow, MapPoint } from "../../types/project";
import { canvasToRelative, pointsToCanvas, relativeToCanvas } from "../../utils/coordinate";
import { usePrimaryButtonDrag } from "./usePrimaryButtonDrag";

interface ArrowShapeProps {
  arrow: BattleArrow;
  frame: ArrowKeyframe;
  selected: boolean;
  mapWidth: number;
  mapHeight: number;
  onSelect: () => void;
  preview?: boolean;
  selectedPointIndices?: number[];
  onPointSelect?: (pointIndex: number) => void;
  onPointDragEnd?: (pointIndex: number, x: number, y: number) => void;
}

export function ArrowShape({ arrow, frame, selected, preview = false, selectedPointIndices = [], mapWidth, mapHeight, onSelect, onPointSelect, onPointDragEnd }: ArrowShapeProps) {
  const [dragPoints, setDragPoints] = useState<MapPoint[] | null>(null);
  const { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton } = usePrimaryButtonDrag();
  const activePoints = dragPoints ?? frame.points;
  const tension = arrow.curveMode === "curve" ? 0.45 : 0;

  useEffect(() => {
    setDragPoints(null);
  }, [frame.time, frame.points]);

  if (frame.points.length < 2) return null;
  return (
    <>
      <Arrow
        points={pointsToCanvas(activePoints, mapWidth, mapHeight)}
        stroke="rgba(255,255,255,0.01)"
        fill="rgba(255,255,255,0.01)"
        strokeWidth={Math.max(20, arrow.width + 16)}
        pointerLength={26}
        pointerWidth={24}
        opacity={0.01}
        lineCap="round"
        lineJoin="round"
        tension={tension}
        onClick={onSelect}
        onTap={onSelect}
      />
      <Arrow
        points={pointsToCanvas(activePoints, mapWidth, mapHeight)}
        stroke={selected ? "#f4d06f" : preview ? "#f0c665" : arrow.color}
        fill={selected ? "#f4d06f" : preview ? "#f0c665" : arrow.color}
        strokeWidth={selected ? arrow.width + 2 : preview ? arrow.width + 2 : arrow.width}
        pointerLength={20}
        pointerWidth={18}
        opacity={preview ? Math.max(0.9, arrow.opacity) : arrow.opacity}
        dash={arrow.dashed ? [15, 10] : undefined}
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
              key={`${arrow.id}-point-${index}`}
              x={position.x}
              y={position.y}
              radius={pointSelected ? 11 : 8}
              fill={pointSelected ? "#ffffff" : "#f4d06f"}
              stroke={pointSelected ? "#f46f5e" : "#1b1f29"}
              strokeWidth={pointSelected ? 3 : 2}
              hitStrokeWidth={14}
              draggable={!arrow.locked}
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
