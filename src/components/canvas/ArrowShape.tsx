import { useEffect, useState } from "react";
import { Arrow, Circle } from "react-konva";
import type { ArrowKeyframe, BattleArrow, MapPoint } from "../../types/project";
import { canvasToRelative, pointsToCanvas, relativeToCanvas } from "../../utils/coordinate";

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
  const visiblePoints = dragPoints ?? frame.points;

  useEffect(() => {
    setDragPoints(null);
  }, [frame.time, frame.points]);

  if (!arrow.visible || !frame.visible || frame.points.length < 2) return null;
  return (
    <>
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
              draggable={!arrow.locked}
              onClick={onSelect}
              onTap={onSelect}
              onDragMove={(event) => {
                const nextPoint = canvasToRelative({ x: event.target.x(), y: event.target.y() }, mapWidth, mapHeight);
                setDragPoints(visiblePoints.map((currentPoint, pointIndex) => (pointIndex === index ? nextPoint : currentPoint)));
              }}
              onDragEnd={(event) => {
                const nextPoint = canvasToRelative({ x: event.target.x(), y: event.target.y() }, mapWidth, mapHeight);
                setDragPoints(null);
                onPointDragEnd?.(index, nextPoint.x, nextPoint.y);
              }}
            />
          );
        })}
    </>
  );
}
