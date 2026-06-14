import { useEffect, useState } from "react";
import { Arrow, Circle, Line } from "react-konva";
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

function clampControlDistance(anchor: MapPoint, control: MapPoint, maxDistance: number): MapPoint {
  const distance = pointDistance(anchor, control);
  if (distance <= maxDistance || distance <= 0) return control;
  const ratio = maxDistance / distance;
  return {
    x: anchor.x + (control.x - anchor.x) * ratio,
    y: anchor.y + (control.y - anchor.y) * ratio,
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
  const finalStart = result[result.length - 1];
  const finalEnd = points[points.length - 1];
  const finalDistance = pointDistance(finalStart, finalEnd);
  if (finalDistance > 0) {
    const finalControlA = clampControlDistance(finalStart, tensionPoints[tensionPoints.length - 1], finalDistance * 0.65);
    const finalControlB = {
      x: finalEnd.x - (finalEnd.x - finalStart.x) * Math.min(0.35, tension),
      y: finalEnd.y - (finalEnd.y - finalStart.y) * Math.min(0.35, tension),
    };
    pushCurveSamples((t) => cubicPoint(finalStart, finalControlA, finalControlB, finalEnd, t));
  } else {
    result.push(finalEnd);
  }

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

function splitArrowPath(points: MapPoint[], pointerLength: number) {
  if (points.length < 2) return null;
  const tip = points[points.length - 1];
  const segmentLengths = points.slice(0, -1).map((point, index) => pointDistance(point, points[index + 1]));
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  if (totalLength <= 0) return null;

  const headLength = Math.min(pointerLength, totalLength * 0.9);
  let remainingLength = headLength;
  let base = points[0];
  let shaftPoints = [points[0]];

  for (let index = points.length - 2; index >= 0; index -= 1) {
    const segmentLength = segmentLengths[index];
    if (segmentLength <= 0) continue;
    if (remainingLength <= segmentLength) {
      const start = points[index];
      const end = points[index + 1];
      const ratio = (segmentLength - remainingLength) / segmentLength;
      base = {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
      shaftPoints = points.slice(0, index + 1);
      if (pointDistance(shaftPoints[shaftPoints.length - 1], base) > 0.001) {
        shaftPoints.push(base);
      }
      break;
    }
    remainingLength -= segmentLength;
  }

  return { shaftPoints, base, tip };
}

function buildArrowGeometry(points: MapPoint[], pointerLength: number, pointerWidth: number) {
  const splitPath = splitArrowPath(points, pointerLength);
  if (!splitPath || splitPath.shaftPoints.length < 2) return null;
  const { shaftPoints, base, tip } = splitPath;
  const directionLength = pointDistance(base, tip);
  if (directionLength <= 0) return null;
  const directionX = (tip.x - base.x) / directionLength;
  const directionY = (tip.y - base.y) / directionLength;
  const perpendicularX = -directionY;
  const perpendicularY = directionX;
  const halfPointerWidth = pointerWidth / 2;
  const headTop = { x: base.x + perpendicularX * halfPointerWidth, y: base.y + perpendicularY * halfPointerWidth };
  const headBottom = { x: base.x - perpendicularX * halfPointerWidth, y: base.y - perpendicularY * halfPointerWidth };
  const headPoints = [tip, headTop, headBottom];

  return {
    shaftPoints: pointsToCanvas(shaftPoints, 1, 1),
    headPoints: pointsToCanvas(headPoints, 1, 1),
  };
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
  const interactive = !arrow.locked;
  const outlineWidth = arrow.outlineEnabled ? Math.max(0, arrow.outlineWidth ?? 4) : 0;
  const outlineColor = arrow.outlineColor ?? "#111827";
  const displayStrokeWidth = preview ? arrow.width + 2 : arrow.width;
  const displayOpacity = preview ? Math.max(0.9, arrow.opacity) : arrow.opacity;
  const displayColor = preview ? "#f0c665" : arrow.color;
  const pointerLength = 20 * arrowHeadSize;
  const pointerWidth = 18 * arrowHeadSize;
  const arrowGeometry = buildArrowGeometry(displayPoints, pointerLength, pointerWidth);
  const outlineGeometry = outlineWidth > 0 ? arrowGeometry : null;

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
            strokeWidth={Math.max(20, displayStrokeWidth + outlineWidth * 2 + 16)}
            pointerLength={Math.max(26, pointerLength + outlineWidth * 1.5 + 6)}
            pointerWidth={Math.max(24, pointerWidth + outlineWidth * 2 + 6)}
            opacity={0.01}
            lineCap="round"
            lineJoin="round"
            tension={drawTension}
            listening={interactive}
            onClick={interactive ? onSelect : undefined}
            onTap={interactive ? onSelect : undefined}
          />
          {selected && (
            <MarchingAntsArrow
              points={canvasPoints}
              strokeWidth={displayStrokeWidth + outlineWidth * 2 + 8}
              pointerLength={pointerLength + outlineWidth * 1.5 + 8}
              pointerWidth={pointerWidth + outlineWidth * 2 + 8}
              lineCap="round"
              lineJoin="round"
              tension={drawTension}
            />
          )}
          {outlineWidth > 0 && outlineGeometry && (
            <>
              <Line
                points={outlineGeometry.shaftPoints}
                stroke={outlineColor}
                strokeWidth={displayStrokeWidth + outlineWidth * 2}
                opacity={displayOpacity}
                dash={arrow.dashed ? [15, 10] : undefined}
                lineCap="butt"
                lineJoin="round"
                listening={false}
              />
              <Line
                points={outlineGeometry.headPoints}
                fill={outlineColor}
                stroke={outlineColor}
                strokeWidth={outlineWidth * 2}
                closed
                opacity={displayOpacity}
                lineJoin="round"
                listening={false}
              />
            </>
          )}
          {arrowGeometry && (
            <>
              <Line
                points={arrowGeometry.shaftPoints}
                stroke={displayColor}
                strokeWidth={displayStrokeWidth}
                opacity={displayOpacity}
                dash={arrow.dashed ? [15, 10] : undefined}
                lineCap="round"
                lineJoin="round"
                listening={interactive}
                onClick={interactive ? onSelect : undefined}
                onTap={interactive ? onSelect : undefined}
              />
              <Line
                points={arrowGeometry.headPoints}
                fill={displayColor}
                closed
                opacity={displayOpacity}
                listening={interactive}
                onClick={interactive ? onSelect : undefined}
                onTap={interactive ? onSelect : undefined}
              />
            </>
          )}
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
