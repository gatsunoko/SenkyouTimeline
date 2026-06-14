import { useEffect, useState } from "react";
import { Arrow, Circle, Line, Path } from "react-konva";
import type { ArrowKeyframe, BattleArrow, MapPoint } from "../../types/project";
import { canvasToRelative, pointsToCanvas, relativeToCanvas } from "../../utils/coordinate";
import { MarchingAntsArrowPath } from "./SelectionMarchingAnts";
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

type PathSegment =
  | { type: "line"; start: MapPoint; end: MapPoint }
  | { type: "quadratic"; start: MapPoint; control: MapPoint; end: MapPoint }
  | { type: "cubic"; start: MapPoint; controlA: MapPoint; controlB: MapPoint; end: MapPoint };

function lerpPoint(a: MapPoint, b: MapPoint, t: number): MapPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
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

function sampleCurvePath(points: MapPoint[], tension: number) {
  if (points.length < 3 || tension <= 0) return points;

  const tensionPoints: MapPoint[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const controls = controlPoints(points[index - 1], points[index], points[index + 1], tension);
    if (!controls) continue;
    tensionPoints.push(controls.before, points[index], controls.after);
  }
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
  while (index < tensionPoints.length - 2) {
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

function buildPathSegments(points: MapPoint[], tension: number): PathSegment[] {
  if (points.length < 2) return [];
  if (points.length < 3 || tension <= 0) {
    return points.slice(0, -1).map((point, index) => ({
      type: "line",
      start: point,
      end: points[index + 1],
    }));
  }

  const tensionPoints: MapPoint[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const controls = controlPoints(points[index - 1], points[index], points[index + 1], tension);
    if (!controls) continue;
    tensionPoints.push(controls.before, points[index], controls.after);
  }
  if (tensionPoints.length < 3) return buildPathSegments(points, 0);

  const segments: PathSegment[] = [
    {
      type: "quadratic",
      start: points[0],
      control: tensionPoints[0],
      end: tensionPoints[1],
    },
  ];
  let index = 2;
  while (index < tensionPoints.length - 2) {
    const previous = segments[segments.length - 1].end;
    segments.push({
      type: "cubic",
      start: previous,
      controlA: tensionPoints[index],
      controlB: tensionPoints[index + 1],
      end: tensionPoints[index + 2],
    });
    index += 3;
  }
  segments.push({
    type: "quadratic",
    start: segments[segments.length - 1].end,
    control: tensionPoints[tensionPoints.length - 1],
    end: points[points.length - 1],
  });

  return segments;
}

function pathSegmentPoint(segment: PathSegment, t: number): MapPoint {
  if (segment.type === "line") return lerpPoint(segment.start, segment.end, t);
  if (segment.type === "quadratic") return quadraticPoint(segment.start, segment.control, segment.end, t);
  return cubicPoint(segment.start, segment.controlA, segment.controlB, segment.end, t);
}

function pathSegmentLength(segment: PathSegment, endT = 1) {
  const samples = 24;
  let length = 0;
  let previous = segment.start;
  for (let sample = 1; sample <= samples; sample += 1) {
    const point = pathSegmentPoint(segment, (endT * sample) / samples);
    length += pointDistance(previous, point);
    previous = point;
  }
  return length;
}

function findSegmentTForLength(segment: PathSegment, targetLength: number) {
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    const middle = (low + high) / 2;
    if (pathSegmentLength(segment, middle) < targetLength) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function splitPathSegment(segment: PathSegment, t: number): PathSegment {
  const clampedT = Math.min(1, Math.max(0, t));
  if (segment.type === "line") {
    return {
      ...segment,
      end: lerpPoint(segment.start, segment.end, clampedT),
    };
  }
  if (segment.type === "quadratic") {
    const startControl = lerpPoint(segment.start, segment.control, clampedT);
    const controlEnd = lerpPoint(segment.control, segment.end, clampedT);
    return {
      type: "quadratic",
      start: segment.start,
      control: startControl,
      end: lerpPoint(startControl, controlEnd, clampedT),
    };
  }

  const startControlA = lerpPoint(segment.start, segment.controlA, clampedT);
  const controlAControlB = lerpPoint(segment.controlA, segment.controlB, clampedT);
  const controlBEnd = lerpPoint(segment.controlB, segment.end, clampedT);
  const controlA = lerpPoint(startControlA, controlAControlB, clampedT);
  const controlB = lerpPoint(controlAControlB, controlBEnd, clampedT);
  return {
    type: "cubic",
    start: segment.start,
    controlA: startControlA,
    controlB: controlA,
    end: lerpPoint(controlA, controlB, clampedT),
  };
}

function trimPathSegmentsBeforeEnd(segments: PathSegment[], endInset: number) {
  if (segments.length === 0 || endInset <= 0) return segments;
  const segmentLengths = segments.map((segment) => pathSegmentLength(segment));
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  const visibleLength = totalLength - endInset;
  if (visibleLength <= 0 || totalLength <= 0) return [];

  let remainingLength = visibleLength;
  const trimmed: PathSegment[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const segmentLength = segmentLengths[index];
    if (remainingLength >= segmentLength) {
      trimmed.push(segment);
      remainingLength -= segmentLength;
      continue;
    }

    if (remainingLength > 0) {
      trimmed.push(splitPathSegment(segment, findSegmentTForLength(segment, remainingLength)));
    }
    break;
  }

  return trimmed;
}

function pathDataForSegments(segments: PathSegment[]) {
  if (segments.length === 0) return "";
  const parts = [`M ${segments[0].start.x} ${segments[0].start.y}`];
  for (const segment of segments) {
    if (segment.type === "line") {
      parts.push(`L ${segment.end.x} ${segment.end.y}`);
    } else if (segment.type === "quadratic") {
      parts.push(`Q ${segment.control.x} ${segment.control.y} ${segment.end.x} ${segment.end.y}`);
    } else {
      parts.push(`C ${segment.controlA.x} ${segment.controlA.y} ${segment.controlB.x} ${segment.controlB.y} ${segment.end.x} ${segment.end.y}`);
    }
  }
  return parts.join(" ");
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

function buildArrowGeometry(points: MapPoint[], pointerLength: number, pointerWidth: number) {
  if (points.length < 2) return null;
  const tip = points[points.length - 1];
  const previous = points[points.length - 2];
  const directionLength = pointDistance(previous, tip);
  if (directionLength <= 0) return null;
  const directionX = (tip.x - previous.x) / directionLength;
  const directionY = (tip.y - previous.y) / directionLength;
  const perpendicularX = -directionY;
  const perpendicularY = directionX;
  const base = {
    x: tip.x - directionX * pointerLength,
    y: tip.y - directionY * pointerLength,
  };
  const halfPointerWidth = pointerWidth / 2;
  const headTop = { x: base.x + perpendicularX * halfPointerWidth, y: base.y + perpendicularY * halfPointerWidth };
  const headBottom = { x: base.x - perpendicularX * halfPointerWidth, y: base.y - perpendicularY * halfPointerWidth };
  const headPoints = [tip, headTop, headBottom];

  return {
    headPoints: pointsToCanvas(headPoints, 1, 1),
    tailPoint: points[0],
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
  const clampedRevealProgress = Math.min(1, Math.max(0, revealProgress));
  const displayPoints = clampedRevealProgress >= 1 ? sampledCanvasPoints : trimPointsAlongPath(sampledCanvasPoints, clampedRevealProgress);
  const displayCanvasPoints = pointsToCanvas(displayPoints, 1, 1);
  const hasVisibleLength = displayPoints.length >= 2 && pointDistance(displayPoints[0], displayPoints[displayPoints.length - 1]) > 0.0001;
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
  const visibleStrokeWidth = displayStrokeWidth + outlineWidth * 2;
  const shaftEndInset = Math.min(pointerLength * 0.95, Math.max(pointerLength * 0.72, (pointerLength * (visibleStrokeWidth + 2)) / Math.max(1, pointerWidth)));
  const shaftSourcePoints = clampedRevealProgress >= 1 ? activeCanvasPoints : displayPoints;
  const shaftSourceTension = clampedRevealProgress >= 1 ? tension : 0;
  const shaftSegments = trimPathSegmentsBeforeEnd(buildPathSegments(shaftSourcePoints, shaftSourceTension), shaftEndInset);
  const shaftPathData = pathDataForSegments(shaftSegments);
  const hasShaftLength = shaftPathData.length > 0;

  useEffect(() => {
    setDragPoints(null);
  }, [frame.time, frame.points]);

  if (frame.points.length < 2) return null;
  return (
    <>
      {hasVisibleLength && (
        <>
          <Arrow
            points={displayCanvasPoints}
            stroke="rgba(255,255,255,0.01)"
            fill="rgba(255,255,255,0.01)"
            strokeWidth={Math.max(20, displayStrokeWidth + outlineWidth * 2 + 16)}
            pointerLength={Math.max(26, pointerLength + outlineWidth * 1.5 + 6)}
            pointerWidth={Math.max(24, pointerWidth + outlineWidth * 2 + 6)}
            opacity={0.01}
            lineCap="round"
            lineJoin="round"
            tension={0}
            listening={interactive}
            onClick={interactive ? onSelect : undefined}
            onTap={interactive ? onSelect : undefined}
          />
          {selected && arrowGeometry && <MarchingAntsArrowPath pathData={shaftPathData} headPoints={arrowGeometry.headPoints} strokeWidth={displayStrokeWidth + outlineWidth * 2 + 8} />}
          {outlineWidth > 0 && outlineGeometry && (
            <>
              {hasShaftLength && (
                <>
                  <Circle
                    x={outlineGeometry.tailPoint.x}
                    y={outlineGeometry.tailPoint.y}
                    radius={(displayStrokeWidth + outlineWidth * 2) / 2}
                    fill={outlineColor}
                    opacity={displayOpacity}
                    listening={false}
                  />
                  <Path
                    data={shaftPathData}
                    stroke={outlineColor}
                    strokeWidth={displayStrokeWidth + outlineWidth * 2}
                    opacity={displayOpacity}
                    dash={arrow.dashed ? [15, 10] : undefined}
                    lineCap="butt"
                    lineJoin="round"
                    listening={false}
                  />
                </>
              )}
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
              {hasShaftLength && (
                <>
                  <Path
                    data={shaftPathData}
                    stroke={displayColor}
                    strokeWidth={displayStrokeWidth}
                    opacity={displayOpacity}
                    dash={arrow.dashed ? [15, 10] : undefined}
                    lineCap="butt"
                    lineJoin="round"
                    listening={interactive}
                    onClick={interactive ? onSelect : undefined}
                    onTap={interactive ? onSelect : undefined}
                  />
                  <Circle
                    x={arrowGeometry.tailPoint.x}
                    y={arrowGeometry.tailPoint.y}
                    radius={displayStrokeWidth / 2}
                    fill={displayColor}
                    opacity={displayOpacity}
                    listening={interactive}
                    onClick={interactive ? onSelect : undefined}
                    onTap={interactive ? onSelect : undefined}
                  />
                </>
              )}
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
