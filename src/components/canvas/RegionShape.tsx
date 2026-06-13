import { Circle, Group, Shape, Text } from "react-konva";
import { useEffect, useState } from "react";
import type { MapPoint, MapRegion } from "../../types/project";
import { canvasToRelative, pointsToCanvas, relativeToCanvas } from "../../utils/coordinate";
import { MarchingAntsLine } from "./SelectionMarchingAnts";
import { usePrimaryButtonDrag } from "./usePrimaryButtonDrag";

interface RegionShapeProps {
  region: MapRegion;
  fillColor: string;
  selected: boolean;
  editable?: boolean;
  mapWidth: number;
  mapHeight: number;
  maskPolygons?: number[][];
  selectedPointIndices?: number[];
  onSelect: () => void;
  onPointSelect?: (pointIndex: number) => void;
  onPointDragEnd?: (pointIndex: number, x: number, y: number) => void;
}

function regionCentroid(points: MapPoint[]) {
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  let area = 0;
  let cx = 0;
  let cy = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current.x * next.y - next.x * current.y;
    area += cross;
    cx += (current.x + next.x) * cross;
    cy += (current.y + next.y) * cross;
  }

  if (Math.abs(area) < 0.000001) {
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  }

  return { x: cx / (3 * area), y: cy / (3 * area) };
}

interface PathContext {
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  closePath: () => void;
}

function appendPolygonPath(context: PathContext, points: number[]) {
  if (points.length < 6) return;
  context.moveTo(points[0], points[1]);
  for (let index = 2; index < points.length - 1; index += 2) {
    context.lineTo(points[index], points[index + 1]);
  }
  context.closePath();
}

function nativeContext(context: unknown) {
  return (context as { _context: CanvasRenderingContext2D })._context;
}

function drawPolygon(context: CanvasRenderingContext2D, points: number[]) {
  context.beginPath();
  appendPolygonPath(context, points);
}

export function RegionShape({ region, fillColor, selected, editable = true, mapWidth, mapHeight, maskPolygons = [], selectedPointIndices = [], onSelect, onPointSelect, onPointDragEnd }: RegionShapeProps) {
  const [dragPoints, setDragPoints] = useState<MapPoint[] | null>(null);
  const { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton } = usePrimaryButtonDrag();
  const activePoints = dragPoints ?? region.points;
  const canvasPoints = pointsToCanvas(activePoints, mapWidth, mapHeight);
  const closedCanvasPoints = [...canvasPoints, canvasPoints[0] ?? 0, canvasPoints[1] ?? 0];
  const centroid = relativeToCanvas(regionCentroid(activePoints), mapWidth, mapHeight);

  useEffect(() => {
    setDragPoints(null);
  }, [region.points]);

  if (region.points.length < 3) return null;

  return (
    <Group>
      <Shape
        onClick={editable || !region.locked ? onSelect : undefined}
        onTap={editable || !region.locked ? onSelect : undefined}
        listening={editable || !region.locked}
        sceneFunc={(context) => {
          const offscreen = document.createElement("canvas");
          offscreen.width = mapWidth;
          offscreen.height = mapHeight;
          const offscreenContext = offscreen.getContext("2d");
          if (!offscreenContext) return;

          drawPolygon(offscreenContext, canvasPoints);
          offscreenContext.fillStyle = fillColor;
          offscreenContext.globalAlpha = region.opacity;
          offscreenContext.fill();

          if (region.borderEnabled && region.borderWidth > 0) {
            offscreenContext.globalAlpha = 1;
            offscreenContext.strokeStyle = region.borderColor;
            offscreenContext.lineWidth = region.borderWidth;
            offscreenContext.lineJoin = "round";
            offscreenContext.stroke();
          }

          if (maskPolygons.length > 0) {
            offscreenContext.globalAlpha = 1;
            offscreenContext.globalCompositeOperation = "destination-out";
            for (const maskPolygon of maskPolygons) {
              drawPolygon(offscreenContext, maskPolygon);
              offscreenContext.fillStyle = "#000000";
              offscreenContext.fill();
              if (region.borderEnabled && region.borderWidth > 0) {
                offscreenContext.strokeStyle = "#000000";
                offscreenContext.lineWidth = region.borderWidth + 2;
                offscreenContext.stroke();
              }
            }
            offscreenContext.globalCompositeOperation = "source-over";
          }

          nativeContext(context).drawImage(offscreen, 0, 0);
        }}
        hitFunc={(context, shape) => {
          context.beginPath();
          appendPolygonPath(context, canvasPoints);
          context.fillStrokeShape(shape);
        }}
      />
      {selected && <MarchingAntsLine points={closedCanvasPoints} strokeWidth={Math.max(3, region.borderWidth + 3)} lineCap="round" lineJoin="round" />}
      {region.showName && (
        <Text
          x={centroid.x - 120}
          y={centroid.y - 14}
          width={240}
          height={28}
          text={region.name}
          align="center"
          verticalAlign="middle"
          fill="#f8fafc"
          stroke="#111827"
          strokeWidth={1.2}
          fontSize={22}
          fontFamily={'"Yu Gothic UI", "Meiryo", system-ui, sans-serif'}
          fontStyle="bold"
          listening={false}
        />
      )}
      {selected &&
        activePoints.map((point, index) => {
          const position = relativeToCanvas(point, mapWidth, mapHeight);
          const pointSelected = selectedPointIndices.includes(index);
          return (
            <Circle
              key={`${region.id}-point-${index}`}
              x={position.x}
              y={position.y}
              radius={pointSelected ? 11 : 8}
              fill={pointSelected ? "#ffffff" : "#f4d06f"}
              stroke={pointSelected ? "#f46f5e" : "#111827"}
              strokeWidth={pointSelected ? 3 : 2}
              hitStrokeWidth={14}
              draggable={editable && !region.locked}
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
    </Group>
  );
}
