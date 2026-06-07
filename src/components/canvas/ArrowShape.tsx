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
  onPointDragEnd?: (pointIndex: number, x: number, y: number) => void;
}

export function ArrowShape({ arrow, frame, selected, mapWidth, mapHeight, onSelect, onPointDragEnd }: ArrowShapeProps) {
  const [dragPoints, setDragPoints] = useState<MapPoint[] | null>(null);
  const { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton } = usePrimaryButtonDrag();
  const visiblePoints = dragPoints ?? frame.points;

  useEffect(() => {
    setDragPoints(null);
  }, [frame.time, frame.points]);

  if (!arrow.visible || !frame.visible || frame.points.length < 2) return null;
  return (
    <>
      <Arrow
        points={pointsToCanvas(visiblePoints, mapWidth, mapHeight)}
        stroke="rgba(255,255,255,0.01)"
        fill="rgba(255,255,255,0.01)"
        strokeWidth={Math.max(20, arrow.width + 16)}
        pointerLength={26}
        pointerWidth={24}
        opacity={0.01}
        lineCap="round"
        lineJoin="round"
        onClick={onSelect}
        onTap={onSelect}
      />
      <Arrow
        points={pointsToCanvas(visiblePoints, mapWidth, mapHeight)}
        stroke={selected ? "#f4d06f" : arrow.color}
        fill={selected ? "#f4d06f" : arrow.color}
        strokeWidth={selected ? arrow.width + 2 : arrow.width}
        pointerLength={20}
        pointerWidth={18}
        opacity={arrow.opacity}
        dash={arrow.dashed ? [15, 10] : undefined}
        lineCap="round"
        lineJoin="round"
        onClick={onSelect}
        onTap={onSelect}
      />
      {selected &&
        visiblePoints.map((point, index) => {
          const position = relativeToCanvas(point, mapWidth, mapHeight);
          return (
            <Circle
              key={`${arrow.id}-point-${index}`}
              x={position.x}
              y={position.y}
              radius={8}
              fill="#f4d06f"
              stroke="#1b1f29"
              strokeWidth={2}
              hitStrokeWidth={14}
              draggable={!arrow.locked}
              onMouseDown={updateDragButton}
              onClick={onSelect}
              onTap={onSelect}
              onDragStart={stopBlockedDrag}
              dragBoundFunc={(nextPosition) => (isDragAllowed() ? nextPosition : position)}
              onDragMove={(event) => {
                if (!isDragAllowed()) return;
                const nextPoint = canvasToRelative({ x: event.target.x(), y: event.target.y() }, mapWidth, mapHeight);
                setDragPoints(visiblePoints.map((currentPoint, pointIndex) => (pointIndex === index ? nextPoint : currentPoint)));
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
