import { useEffect, useState } from "react";
import { Arrow, Circle } from "react-konva";
import type { ArrowKeyframe, BattleArrow, MapPoint } from "../../types/project";
import { canvasToRelative, pointsToCanvas, relativeToCanvas } from "../../utils/coordinate";
import { MarchingAntsArrow } from "./SelectionMarchingAnts";
import { usePrimaryButtonDrag } from "./usePrimaryButtonDrag";

interface ArrowShapeProps {
  arrow: BattleArrow;
  frame: ArrowKeyframe;
  selected: boolean;
  mapWidth: number;
  mapHeight: number;
  onSelect: () => void;
  preview?: boolean;
  revealProgress?: number;
  selectedPointIndices?: number[];
  onPointSelect?: (pointIndex: number) => void;
  onPointDragEnd?: (pointIndex: number, x: number, y: number) => void;
  dragEnabled?: boolean;
}

function pointDistance(a: MapPoint, b: MapPoint) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function quadraticPoint(start: MapPoint, control: MapPoint, end: MapPoint, t: number): MapPoint {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
  };
}

function cubicPoint(start: MapPoint, controlA: MapPoint, controlB: MapPoint, end: MapPoint, t: number): MapPoint {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * inverse * start.x + 3 * inverse * inverse * t * controlA.x + 3 * inverse * t * t * controlB.x + t * t * t * end.x,
    y: inverse * inverse * inverse * start.y + 3 * inverse * inverse * t * controlA.y + 3 * inverse * t * t * controlB.y + t * t * t * end.y,
  };
}

function controlPoints(previous: MapPoint, current: MapPoint, next: MapPoint, tension: number) {
  const previousDistance = pointDistance(previous, current);
  const nextDistance = pointDistance(current, next);
  const totalDistance = previousDistance + nextDistance;
  if (totalDistance <= 0) return null;
  const beforeRatio = (tension * previousDistance) / totalDistance;
  const afterRatio = (tension * nextDistance) / totalDistance;
  return {
    before: {
      x: current.x - beforeRatio * (next.x - previous.x),
      y: current.y - beforeRatio * (next.y - previous.y),
    },
    after: {
      x: current.x + afterRatio * (next.x - previous.x),
      y: current.y + afterRatio * (next.y - previous.y),
    },
  };
}

function expandTensionPoints(points: MapPoint[], tension: number) {
  const result: MapPoint[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const controls = controlPoints(points[index - 1], points[index], points[index + 1], tension);
    if (!controls) continue;
    result.push(controls.before, points[index], controls.after);
  }
  return result;
}

function sampleCurvePath(points: MapPoint[], tension: number) {
  if (points.length < 3 || tension <= 0) return points;
  const tensionPoints = expandTensionPoints(points, tension);
  if (tensionPoints.length < 3) return points;

  const samplesPerCurve = 18;
  const result: MapPoint[] = [points[0]];
  const pushCurveSamples = (sampler: (t: number) => MapPoint) => {
    for (let sample = 1; sample <= samplesPerCurve; sample += 1) {
      result.push(sampler(sample / samplesPerCurve));
    }
  };

  pushCurveSamples((t) => quadraticPoint(points[0], tensionPoints[0], tensionPoints[1], t));
  let index = 2;
  while (index < tensionPoints.length - 1) {
    const start = result[result.length - 1];
    const controlA = tensionPoints[index];
    const controlB = tensionPoints[index + 1];
    const end = tensionPoints[index + 2];
    pushCurveSamples((t) => cubicPoint(start, controlA, controlB, end, t));
    index += 3;
  }
  pushCurveSamples((t) => quadraticPoint(result[result.length - 1], tensionPoints[tensionPoints.length - 1], points[points.length - 1], t));

  return result;
}

function trimPointsAlongPath(points: MapPoint[], progress: number) {
  if (points.length < 2) return points;
  const clampedProgress = Math.min(1, Math.max(0, progress));
  if (clampedProgress >= 1) return points;

  const segmentLengths = points.slice(0, -1).map((point, index) => pointDistance(point, points[index + 1]));
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  if (totalLength <= 0) return [points[0], points[0]];

  let remainingLength = totalLength * clampedProgress;
  const trimmed: MapPoint[] = [points[0]];
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    const start = points[index];
    const end = points[index + 1];
    if (remainingLength >= segmentLength) {
      trimmed.push(end);
      remainingLength -= segmentLength;
      continue;
    }

    const ratio = segmentLength <= 0 ? 0 : remainingLength / segmentLength;
    trimmed.push({
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    });
    return trimmed;
  }

  return trimmed;
}

export function ArrowShape({ arrow, frame, selected, preview = false, revealProgress = 1, selectedPointIndices = [], mapWidth, mapHeight, onSelect, onPointSelect, onPointDragEnd, dragEnabled = true }: ArrowShapeProps) {
  const [dragPoints, setDragPoints] = useState<MapPoint[] | null>(null);
  const { updateDragButton, stopBlockedDrag, isDragAllowed, resetDragButton } = usePrimaryButtonDrag();
  const activePoints = dragPoints ?? frame.points;
  const tension = arrow.curveMode === "curve" ? 0.45 : 0;
  const arrowHeadSize = arrow.arrowHeadSize ?? 1;
  const activeCanvasPoints = activePoints.map((point) => relativeToCanvas(point, mapWidth, mapHeight));
  const sampledCanvasPoints = sampleCurvePath(activeCanvasPoints, tension);
  const displayPoints = trimPointsAlongPath(sampledCanvasPoints, revealProgress);
  const canvasPoints = pointsToCanvas(displayPoints, 1, 1);
  const hasVisibleLength = displayPoints.length >= 2 && pointDistance(displayPoints[0], displayPoints[displayPoints.length - 1]) > 0.0001;
  const drawTension = 0;

  useEffect(() => {
    setDragPoints(null);
  }, [frame.time, frame.points]);

  if (frame.points.length < 2) return null;
  return (
    <>
      {hasVisibleLength && (
        <>
          <Arrow
            points={canvasPoints}
            stroke="rgba(255,255,255,0.01)"
            fill="rgba(255,255,255,0.01)"
            strokeWidth={Math.max(20, arrow.width + 16)}
            pointerLength={Math.max(26, 20 * arrowHeadSize + 6)}
            pointerWidth={Math.max(24, 18 * arrowHeadSize + 6)}
            opacity={0.01}
            lineCap="round"
            lineJoin="round"
            tension={drawTension}
            onClick={onSelect}
            onTap={onSelect}
          />
          {selected && <MarchingAntsArrow points={canvasPoints} strokeWidth={arrow.width + 8} pointerLength={20 * arrowHeadSize + 8} pointerWidth={18 * arrowHeadSize + 8} lineCap="round" lineJoin="round" tension={drawTension} />}
          <Arrow
            points={canvasPoints}
            stroke={preview ? "#f0c665" : arrow.color}
            fill={preview ? "#f0c665" : arrow.color}
            strokeWidth={preview ? arrow.width + 2 : arrow.width}
            pointerLength={20 * arrowHeadSize}
            pointerWidth={18 * arrowHeadSize}
            opacity={preview ? Math.max(0.9, arrow.opacity) : arrow.opacity}
            dash={arrow.dashed ? [15, 10] : undefined}
            lineCap="round"
            lineJoin="round"
            tension={drawTension}
            onClick={onSelect}
            onTap={onSelect}
          />
        </>
      )}
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
              draggable={dragEnabled && !arrow.locked}
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
