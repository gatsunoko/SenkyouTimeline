import { Circle, Line } from "react-konva";
import { useEffect, useState } from "react";
import type { BattleLine, LineKeyframe } from "../../types/project";
import type { MapPoint } from "../../types/project";
import { canvasToRelative, relativeToCanvas, pointsToCanvas } from "../../utils/coordinate";

interface LineShapeProps {
  line: BattleLine;
  frame: LineKeyframe;
  selected: boolean;
  mapWidth: number;
  mapHeight: number;
  onSelect: () => void;
  selectedPointIndices?: number[];
  onPointSelect?: (pointIndex: number) => void;
  onPointDragEnd?: (pointIndex: number, x: number, y: number) => void;
}

export function LineShape({ line, frame, selected, selectedPointIndices = [], mapWidth, mapHeight, onSelect, onPointSelect, onPointDragEnd }: LineShapeProps) {
  const [dragPoints, setDragPoints] = useState<MapPoint[] | null>(null);
  const visiblePoints = dragPoints ?? frame.points;
  const tension = line.curveMode === "curve" ? 0.45 : 0;

  useEffect(() => {
    setDragPoints(null);
  }, [frame.time, frame.points]);

  if (!frame.visible || frame.points.length < 2) return null;
  return (
    <>
      <Line
        points={pointsToCanvas(visiblePoints, mapWidth, mapHeight)}
        stroke="rgba(255,255,255,0.01)"
        strokeWidth={Math.max(18, line.width + 14)}
        opacity={0.01}
        lineCap="round"
        lineJoin="round"
        tension={tension}
        onClick={onSelect}
        onTap={onSelect}
      />
      <Line
        points={pointsToCanvas(visiblePoints, mapWidth, mapHeight)}
        stroke={selected ? "#f4d06f" : line.color}
        strokeWidth={selected ? line.width + 3 : line.width}
        opacity={line.opacity}
        dash={line.dashed ? [16, 10] : undefined}
        lineCap="round"
        lineJoin="round"
        tension={tension}
        onClick={onSelect}
        onTap={onSelect}
      />
      {selected &&
        visiblePoints.map((point, index) => {
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
              onClick={(event) => {
                event.cancelBubble = true;
                onPointSelect?.(index);
              }}
              onTap={(event) => {
                event.cancelBubble = true;
                onPointSelect?.(index);
              }}
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
