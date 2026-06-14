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

function extrapolatePoint(point: MapPoint, neighbor: MapPoint): MapPoint {
  return {
    x: point.x + (point.x - neighbor.x),
    y: point.y + (point.y - neighbor.y),
  };
}

function curveParameterStep(a: MapPoint, b: MapPoint) {
  return Math.max(0.0001, Math.sqrt(pointDistance(a, b)));
}

function interpolateCurvePoint(a: MapPoint, b: MapPoint, startT: number, endT: number, currentT: number): MapPoint {
  const span = endT - startT;
  if (span <= 0.000001) return b;
  const startWeight = (endT - currentT) / span;
  const endWeight = (currentT - startT) / span;
  return {
    x: a.x * startWeight + b.x * endWeight,
    y: a.y * startWeight + b.y * endWeight,
  };
}

function catmullRomPoint(p0: MapPoint, p1: MapPoint, p2: MapPoint, p3: MapPoint, segmentT: number): MapPoint {
  const t0 = 0;
  const t1 = t0 + curveParameterStep(p0, p1);
  const t2 = t1 + curveParameterStep(p1, p2);
  const t3 = t2 + curveParameterStep(p2, p3);
  const t = t1 + (t2 - t1) * segmentT;
  const a1 = interpolateCurvePoint(p0, p1, t0, t1, t);
  const a2 = interpolateCurvePoint(p1, p2, t1, t2, t);
  const a3 = interpolateCurvePoint(p2, p3, t2, t3, t);
  const b1 = interpolateCurvePoint(a1, a2, t0, t2, t);
  const b2 = interpolateCurvePoint(a2, a3, t1, t3, t);
  return interpolateCurvePoint(b1, b2, t1, t2, t);
}

function sampleCurvePath(points: MapPoint[], tension: number) {
  if (points.length < 3 || tension <= 0) return points;

  const samplesPerCurve = 24;
  const curveStrength = Math.min(1, Math.max(0, tension / 0.45));
  const result: MapPoint[] = [points[0]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const previous = points[index - 1] ?? extrapolatePoint(start, end);
    const next = points[index + 2] ?? extrapolatePoint(end, start);
    for (let sample = 1; sample <= samplesPerCurve; sample += 1) {
      const segmentT = sample / samplesPerCurve;
      const curvedPoint = catmullRomPoint(previous, start, end, next, segmentT);
      if (curveStrength >= 1) {
        result.push(curvedPoint);
        continue;
      }
      const linearPoint = {
        x: start.x + (end.x - start.x) * segmentT,
        y: start.y + (end.y - start.y) * segmentT,
      };
      result.push({
        x: linearPoint.x + (curvedPoint.x - linearPoint.x) * curveStrength,
        y: linearPoint.y + (curvedPoint.y - linearPoint.y) * curveStrength,
      });
    }
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
