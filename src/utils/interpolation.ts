import type { ArrowKeyframe, BattleArrow, BattleLine, CameraKeyframe, ExportCamera, InterpolationMode, LineKeyframe, MapPoint, PlacedImage, PlacedImageKeyframe, Site, SiteKeyframe, Unit, UnitKeyframe, UnitRoute, UnitRouteSegment } from "../types/project";
import { compareTime, parseTimelineSeconds } from "./time";

export interface ResolvedUnitFrame extends UnitKeyframe {
  effectiveFactionId: string;
  effectiveCertainty: Unit["certainty"];
}

export interface ResolvedSiteFrame extends SiteKeyframe {
  effectiveFactionId: string;
}

export interface ResolvedCameraFrame extends CameraKeyframe {
  width: number;
  height: number;
  scale: number;
}

export type ResolvedPlacedImageFrame = PlacedImageKeyframe;

function orderedUnitKeyframes(unit: Unit) {
  return [...unit.keyframes].sort((a, b) => compareTime(a.time, b.time));
}

function orderedCameraKeyframes(camera: ExportCamera) {
  return [...camera.keyframes].sort((a, b) => compareTime(a.time, b.time));
}

function resolveUnitSize(unit: Unit, keyframes: UnitKeyframe[], currentTime: string, mode: InterpolationMode) {
  const sizeKeyframes = keyframes.filter((frame) => frame.size !== undefined);
  const previous = [...sizeKeyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0);
  const next = sizeKeyframes.find((frame) => compareTime(frame.time, currentTime) >= 0);
  const baseSize = previous?.size ?? unit.size;

  if (mode === "linear" && previous?.size !== undefined && next?.size !== undefined && previous.time !== next.time) {
    const start = parseTimelineSeconds(previous.time);
    const end = parseTimelineSeconds(next.time);
    const current = parseTimelineSeconds(currentTime);
    if (!Number.isNaN(start) && !Number.isNaN(end) && !Number.isNaN(current) && end > start) {
      const t = Math.min(1, Math.max(0, (current - start) / (end - start)));
      return previous.size + (next.size - previous.size) * t;
    }
  }

  return baseSize;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function samplePolyline(points: { x: number; y: number }[], count: number) {
  if (points.length === 0) return [];
  if (count <= 1 || points.length === 1) return Array.from({ length: Math.max(1, count) }, () => ({ ...points[0] }));

  const segmentLengths = points.slice(1).map((point, index) => distance(points[index], point));
  const totalLength = segmentLengths.reduce((sum, value) => sum + value, 0);
  if (totalLength <= 0) return Array.from({ length: count }, () => ({ ...points[0] }));

  return Array.from({ length: count }, (_, sampleIndex) => {
    const targetDistance = (totalLength * sampleIndex) / (count - 1);
    let traveled = 0;

    for (let segmentIndex = 0; segmentIndex < segmentLengths.length; segmentIndex += 1) {
      const segmentLength = segmentLengths[segmentIndex];
      const nextTraveled = traveled + segmentLength;
      if (targetDistance <= nextTraveled || segmentIndex === segmentLengths.length - 1) {
        const start = points[segmentIndex];
        const end = points[segmentIndex + 1];
        const t = segmentLength <= 0 ? 0 : (targetDistance - traveled) / segmentLength;
        return {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        };
      }
      traveled = nextTraveled;
    }

    return { ...points[points.length - 1] };
  });
}

function interpolatePointLists(previousPoints: { x: number; y: number }[], nextPoints: { x: number; y: number }[], t: number) {
  const pointCount = Math.max(previousPoints.length, nextPoints.length);
  const sampledPrevious = previousPoints.length === pointCount ? previousPoints : samplePolyline(previousPoints, pointCount);
  const sampledNext = nextPoints.length === pointCount ? nextPoints : samplePolyline(nextPoints, pointCount);

  return sampledPrevious.map((point, index) => ({
    x: point.x + (sampledNext[index].x - point.x) * t,
    y: point.y + (sampledNext[index].y - point.y) * t,
  }));
}

function pointOnPolyline(points: MapPoint[], progress: number): MapPoint | null {
  if (points.length === 0) return null;
  if (points.length === 1) return { ...points[0] };

  const clampedProgress = Math.min(1, Math.max(0, progress));
  const segmentLengths = points.slice(1).map((point, index) => distance(points[index], point));
  const totalLength = segmentLengths.reduce((sum, value) => sum + value, 0);
  if (totalLength <= 0) return { ...points[0] };

  const targetDistance = totalLength * clampedProgress;
  let traveled = 0;

  for (let segmentIndex = 0; segmentIndex < segmentLengths.length; segmentIndex += 1) {
    const segmentLength = segmentLengths[segmentIndex];
    const nextTraveled = traveled + segmentLength;
    if (targetDistance <= nextTraveled || segmentIndex === segmentLengths.length - 1) {
      const start = points[segmentIndex];
      const end = points[segmentIndex + 1];
      const t = segmentLength <= 0 ? 0 : (targetDistance - traveled) / segmentLength;
      return {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
    }
    traveled = nextTraveled;
  }

  return { ...points[points.length - 1] };
}

function catmullRomPoint(p0: MapPoint, p1: MapPoint, p2: MapPoint, p3: MapPoint, t: number): MapPoint {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (p2.x - p0.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (p2.y - p0.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

function sampleCurvePath(points: MapPoint[], samplesPerSegment = 18): MapPoint[] {
  if (points.length < 3) return points.map((point) => ({ ...point }));

  const sampled: MapPoint[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;

    for (let sampleIndex = 0; sampleIndex < samplesPerSegment; sampleIndex += 1) {
      const t = sampleIndex / samplesPerSegment;
      if (index > 0 || sampleIndex > 0) sampled.push(catmullRomPoint(p0, p1, p2, p3, t));
      else sampled.push({ ...p1 });
    }
  }
  sampled.push({ ...points[points.length - 1] });
  return sampled;
}

function resolveRoutePoints(pointsKeyframes: { time: string; points: MapPoint[] }[], currentTime: string, mode: InterpolationMode): MapPoint[] | null {
  const keyframes = [...pointsKeyframes].sort((a, b) => compareTime(a.time, b.time));
  if (keyframes.length === 0) return null;

  const previous = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0);
  const next = keyframes.find((frame) => compareTime(frame.time, currentTime) >= 0);
  const base = previous ?? next;
  if (!base) return null;

  if (mode !== "linear" || !previous || !next || previous.time === next.time) {
    return base.points.map((point) => ({ ...point }));
  }

  const start = parseTimelineSeconds(previous.time);
  const end = parseTimelineSeconds(next.time);
  const current = parseTimelineSeconds(currentTime);
  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(current) || end <= start) {
    return base.points.map((point) => ({ ...point }));
  }

  const t = Math.min(1, Math.max(0, (current - start) / (end - start)));
  return interpolatePointLists(previous.points, next.points, t);
}

export function resolveLineRoutePoints(line: BattleLine, currentTime: string, mode: InterpolationMode) {
  const points = resolveRoutePoints(line.keyframes, currentTime, mode);
  if (!points) return null;
  return line.curveMode === "curve" ? sampleCurvePath(points) : points;
}

export function resolveArrowRoutePoints(arrow: BattleArrow, currentTime: string, mode: InterpolationMode) {
  const keyframes =
    arrow.keyframes && arrow.keyframes.length > 0
      ? arrow.keyframes
      : [
          {
            time: arrow.startTime,
            points: arrow.points,
          },
        ];
  const points = resolveRoutePoints(keyframes, currentTime, mode);
  if (!points) return null;
  return arrow.curveMode === "curve" ? sampleCurvePath(points) : points;
}

export function getUnitRouteSegments(route?: UnitRoute | null): UnitRouteSegment[] {
  if (!route) return [];
  const segments = route.segments && route.segments.length > 0 ? route.segments : [route];
  return segments
    .filter((segment) => segment.sourceId && (segment.sourceType === "line" || segment.sourceType === "arrow"))
    .map((segment, index) => ({
      ...segment,
      id: segment.id || `route_segment_${index + 1}`,
      direction: segment.direction ?? "forward",
    }));
}

export function getUnitRouteTimeRange(route?: UnitRoute | null) {
  const segments = getUnitRouteSegments(route);
  if (segments.length === 0) return null;
  return {
    startTime: segments[0].startTime,
    endTime: segments[segments.length - 1].endTime,
  };
}

export function resolveCameraFrame(camera: ExportCamera, currentTime: string, mode: InterpolationMode): ResolvedCameraFrame {
  const keyframes = orderedCameraKeyframes(camera);
  const fallback = keyframes[0] ?? { time: currentTime, displayDate: currentTime, x: 0, y: 0 };
  const width = Math.max(1, Math.round(camera.width));
  const height = Math.max(1, Math.round(camera.height));
  const baseScale = Number.isFinite(camera.scale) ? Math.max(0.1, Math.min(8, camera.scale ?? 1)) : 1;
  const resolveScale = (frame?: CameraKeyframe) => (Number.isFinite(frame?.scale) ? Math.max(0.1, Math.min(8, frame?.scale ?? baseScale)) : baseScale);
  if (keyframes.length === 0) return { ...fallback, width, height, scale: resolveScale(fallback) };

  const previous = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0);
  const next = keyframes.find((frame) => compareTime(frame.time, currentTime) >= 0);
  const base = previous ?? next ?? fallback;
  const scale = resolveScale(base);

  if (mode === "linear" && previous && next && previous.time !== next.time) {
    const start = parseTimelineSeconds(previous.time);
    const end = parseTimelineSeconds(next.time);
    const current = parseTimelineSeconds(currentTime);
    if (!Number.isNaN(start) && !Number.isNaN(end) && !Number.isNaN(current) && end > start) {
      const t = Math.min(1, Math.max(0, (current - start) / (end - start)));
      const previousScale = resolveScale(previous);
      const nextScale = resolveScale(next);
      return {
        time: currentTime,
        displayDate: base.displayDate,
        x: previous.x + (next.x - previous.x) * t,
        y: previous.y + (next.y - previous.y) * t,
        width,
        height,
        scale: previousScale + (nextScale - previousScale) * t,
      };
    }
  }

  return { ...base, width, height, scale };
}

function resolveRouteSegmentPoints(segment: UnitRouteSegment, lines: BattleLine[], arrows: BattleArrow[], routeTime: string, mode: InterpolationMode) {
  const routeSourcePoints =
    segment.sourceType === "line"
      ? (() => {
          const line = lines.find((entry) => entry.id === segment.sourceId);
          return line ? resolveLineRoutePoints(line, routeTime, mode) : null;
        })()
      : (() => {
          const arrow = arrows.find((entry) => entry.id === segment.sourceId);
          return arrow ? resolveArrowRoutePoints(arrow, routeTime, mode) : null;
        })();
  return routeSourcePoints && routeSourcePoints.length > 0 ? routeSourcePoints : segment.fallbackPoints;
}

function routeSegmentDirectedPoints(segment: UnitRouteSegment, points: MapPoint[]) {
  return segment.direction === "reverse" ? [...points].reverse() : points;
}

function routeSegmentEndpoint(segment: UnitRouteSegment, lines: BattleLine[], arrows: BattleArrow[], endpoint: "start" | "end", mode: InterpolationMode): MapPoint | null {
  const points = resolveRouteSegmentPoints(segment, lines, arrows, endpoint === "start" ? segment.startTime : segment.endTime, mode);
  if (!points || points.length === 0) return null;
  const directedPoints = routeSegmentDirectedPoints(segment, points);
  return { ...(endpoint === "start" ? directedPoints[0] : directedPoints[directedPoints.length - 1]) };
}

export function resolveUnitFrame(unit: Unit, currentTime: string, mode: InterpolationMode): ResolvedUnitFrame | null {
  const keyframes = orderedUnitKeyframes(unit);
  if (keyframes.length === 0) {
    const displayStartTime = unit.displayStartTime;
    const displayEndTime = unit.displayEndTime;
    if (displayStartTime && compareTime(currentTime, displayStartTime) < 0) return null;
    if (displayEndTime && compareTime(currentTime, displayEndTime) > 0) return null;
    return {
      time: currentTime,
      displayDate: currentTime,
      x: unit.x ?? 0.5,
      y: unit.y ?? 0.5,
      rotation: unit.rotation ?? 0,
      size: unit.size,
      status: unit.status,
      factionId: unit.factionId,
      certainty: unit.certainty,
      sourceNote: unit.sourceNote,
      effectiveFactionId: unit.factionId,
      effectiveCertainty: unit.certainty,
    };
  }

  const displayStartTime = unit.displayStartTime ?? keyframes[0].time;
  const displayEndTime = unit.displayEndTime;
  if (displayStartTime && compareTime(currentTime, displayStartTime) < 0) return null;
  if (displayEndTime && compareTime(currentTime, displayEndTime) > 0) return null;

  const previous = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0);
  const next = keyframes.find((frame) => compareTime(frame.time, currentTime) >= 0);

  if (!previous && next) {
    const factionFrame = next.factionId ? next : undefined;
    const certaintyFrame = next.certainty ? next : undefined;
    return {
      ...next,
      size: resolveUnitSize(unit, keyframes, currentTime, mode),
      effectiveFactionId: factionFrame?.factionId ?? unit.factionId,
      effectiveCertainty: certaintyFrame?.certainty ?? unit.certainty,
    };
  }
  if (!previous) return null;
  const factionFrame = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0 && frame.factionId);
  const certaintyFrame = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0 && frame.certainty);
  const base = { ...previous, size: resolveUnitSize(unit, keyframes, currentTime, mode) };

  if (mode === "linear" && next && previous.time !== next.time) {
    const start = parseTimelineSeconds(previous.time);
    const end = parseTimelineSeconds(next.time);
    const current = parseTimelineSeconds(currentTime);
    if (!Number.isNaN(start) && !Number.isNaN(end) && !Number.isNaN(current) && end > start) {
      const t = Math.min(1, Math.max(0, (current - start) / (end - start)));
      base.x = previous.x + (next.x - previous.x) * t;
      base.y = previous.y + (next.y - previous.y) * t;
      base.rotation = previous.rotation + (next.rotation - previous.rotation) * t;
    }
  }

  return {
    ...base,
    effectiveFactionId: factionFrame?.factionId ?? unit.factionId,
    effectiveCertainty: certaintyFrame?.certainty ?? unit.certainty,
  };
}

export function resolveUnitRoutePoint(unit: Unit, lines: BattleLine[], arrows: BattleArrow[], currentTime: string, mode: InterpolationMode): MapPoint | null {
  if (!unit.route) return null;

  const currentSeconds = parseTimelineSeconds(currentTime);
  if (Number.isNaN(currentSeconds)) return null;

  const segments = getUnitRouteSegments(unit.route);
  let previousEndpoint: { point: MapPoint; seconds: number } | null = null;

  for (const segment of segments) {
    const startSeconds = parseTimelineSeconds(segment.startTime);
    const endSeconds = Math.max(startSeconds, parseTimelineSeconds(segment.endTime));
    if (Number.isNaN(startSeconds) || Number.isNaN(endSeconds)) continue;

    if (currentSeconds < startSeconds) {
      if (!previousEndpoint || currentSeconds < previousEndpoint.seconds) return null;
      const nextStartPoint = routeSegmentEndpoint(segment, lines, arrows, "start", mode);
      if (!nextStartPoint) return previousEndpoint.point;
      if (startSeconds <= previousEndpoint.seconds) return nextStartPoint;
      const progress = (currentSeconds - previousEndpoint.seconds) / (startSeconds - previousEndpoint.seconds);
      return {
        x: previousEndpoint.point.x + (nextStartPoint.x - previousEndpoint.point.x) * progress,
        y: previousEndpoint.point.y + (nextStartPoint.y - previousEndpoint.point.y) * progress,
      };
    }

    if (currentSeconds <= endSeconds) {
      const routeTime = currentSeconds > endSeconds ? segment.endTime : currentTime;
      const effectiveRoutePoints = resolveRouteSegmentPoints(segment, lines, arrows, routeTime, mode);
      if (!effectiveRoutePoints || effectiveRoutePoints.length === 0) return previousEndpoint?.point ?? null;
      const routePoints = routeSegmentDirectedPoints(segment, effectiveRoutePoints);
      const progress = endSeconds <= startSeconds ? 1 : (currentSeconds - startSeconds) / (endSeconds - startSeconds);
      return pointOnPolyline(routePoints, progress);
    }

    const endPoint = routeSegmentEndpoint(segment, lines, arrows, "end", mode);
    if (endPoint) previousEndpoint = { point: endPoint, seconds: endSeconds };
  }

  return previousEndpoint?.point ?? null;
}

export function resolveUnitRouteExitPoint(unit: Unit, lines: BattleLine[], arrows: BattleArrow[], currentTime: string, mode: InterpolationMode): MapPoint | null {
  if (!unit.route) return null;

  const currentSeconds = parseTimelineSeconds(currentTime);
  if (Number.isNaN(currentSeconds)) return null;

  const segments = getUnitRouteSegments(unit.route);
  const lastSegment = segments[segments.length - 1];
  if (!lastSegment) return null;

  const endSeconds = parseTimelineSeconds(lastSegment.endTime);
  if (Number.isNaN(endSeconds) || currentSeconds <= endSeconds) return null;

  const endPoint = routeSegmentEndpoint(lastSegment, lines, arrows, "end", mode);
  if (!endPoint) return null;

  const nextKeyframe = orderedUnitKeyframes(unit).find((frame) => {
    const frameSeconds = parseTimelineSeconds(frame.time);
    return !Number.isNaN(frameSeconds) && frameSeconds > endSeconds + 0.0001;
  });
  if (!nextKeyframe) return endPoint;

  const nextSeconds = parseTimelineSeconds(nextKeyframe.time);
  if (Number.isNaN(nextSeconds) || nextSeconds <= endSeconds) return endPoint;
  if (currentSeconds >= nextSeconds - 0.0001) return null;

  const progress = Math.min(1, Math.max(0, (currentSeconds - endSeconds) / (nextSeconds - endSeconds)));
  return {
    x: endPoint.x + (nextKeyframe.x - endPoint.x) * progress,
    y: endPoint.y + (nextKeyframe.y - endPoint.y) * progress,
  };
}

export function resolveUnitRouteApproachPoint(unit: Unit, lines: BattleLine[], arrows: BattleArrow[], currentTime: string, mode: InterpolationMode): MapPoint | null {
  if (!unit.route) return null;

  const currentSeconds = parseTimelineSeconds(currentTime);
  if (Number.isNaN(currentSeconds)) return null;

  const nextSegment = getUnitRouteSegments(unit.route).find((segment) => {
    const startSeconds = parseTimelineSeconds(segment.startTime);
    return !Number.isNaN(startSeconds) && currentSeconds < startSeconds;
  });
  if (!nextSegment) return null;

  const startSeconds = parseTimelineSeconds(nextSegment.startTime);
  const startPoint = routeSegmentEndpoint(nextSegment, lines, arrows, "start", mode);
  if (!startPoint) return null;

  const previousKeyframe = [...orderedUnitKeyframes(unit)].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0);
  if (!previousKeyframe) return null;

  const previousSeconds = parseTimelineSeconds(previousKeyframe.time);
  if (Number.isNaN(previousSeconds) || startSeconds <= previousSeconds) return startPoint;

  const progress = Math.min(1, Math.max(0, (currentSeconds - previousSeconds) / (startSeconds - previousSeconds)));
  return {
    x: previousKeyframe.x + (startPoint.x - previousKeyframe.x) * progress,
    y: previousKeyframe.y + (startPoint.y - previousKeyframe.y) * progress,
  };
}

export function resolveSiteFrame(site: Site, currentTime: string): ResolvedSiteFrame {
  const keyframes = site.keyframes && site.keyframes.length > 0 ? [...site.keyframes].sort((a, b) => compareTime(a.time, b.time)) : [];
  const previous = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0);
  const fallback: SiteKeyframe = {
    time: currentTime,
    displayDate: currentTime,
    factionId: site.factionId,
  };
  const base = previous ?? fallback;
  return {
    ...base,
    effectiveFactionId: base.factionId || site.factionId,
  };
}

export function resolvePlacedImageFrame(image: PlacedImage, currentTime: string, mode: InterpolationMode): ResolvedPlacedImageFrame {
  const keyframes = [...(image.keyframes ?? [])].sort((a, b) => compareTime(a.time, b.time));
  const fallback: PlacedImageKeyframe = {
    time: currentTime,
    displayDate: currentTime,
    x: image.x,
    y: image.y,
  };
  if (keyframes.length === 0) return fallback;

  const previous = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0);
  const next = keyframes.find((frame) => compareTime(frame.time, currentTime) >= 0);
  const base = previous ?? next ?? fallback;

  if (mode !== "linear" || !previous || !next || previous.time === next.time) return { ...base };

  const start = parseTimelineSeconds(previous.time);
  const end = parseTimelineSeconds(next.time);
  const current = parseTimelineSeconds(currentTime);
  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(current) || end <= start) return { ...base };

  const t = Math.min(1, Math.max(0, (current - start) / (end - start)));
  return {
    time: currentTime,
    displayDate: base.displayDate,
    x: previous.x + (next.x - previous.x) * t,
    y: previous.y + (next.y - previous.y) * t,
  };
}

export function resolveLineKeyframe(line: BattleLine, currentTime: string, mode: InterpolationMode): LineKeyframe | null {
  const keyframes = [...line.keyframes].sort((a, b) => compareTime(a.time, b.time));
  const displayStartTime = line.displayStartTime ?? keyframes[0]?.time;
  const displayEndTime = line.displayEndTime;
  if (displayStartTime && compareTime(currentTime, displayStartTime) < 0) return null;
  if (displayEndTime && compareTime(currentTime, displayEndTime) > 0) return null;
  const previous = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0);
  const next = keyframes.find((frame) => compareTime(frame.time, currentTime) >= 0);
  if (!previous && next) return null;
  if (!previous) return null;

  const base: LineKeyframe = { ...previous, points: previous.points.map((point) => ({ ...point })) };
  if (mode !== "linear" || !next || previous.time === next.time) return base;

  const start = parseTimelineSeconds(previous.time);
  const end = parseTimelineSeconds(next.time);
  const current = parseTimelineSeconds(currentTime);
  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(current) || end <= start) return base;

  const t = Math.min(1, Math.max(0, (current - start) / (end - start)));
  return {
    ...base,
    points: interpolatePointLists(previous.points, next.points, t),
  };
}

export function resolveArrowKeyframe(arrow: BattleArrow, currentTime: string, mode: InterpolationMode): ArrowKeyframe | null {
  const keyframes =
    arrow.keyframes && arrow.keyframes.length > 0
      ? [...arrow.keyframes].sort((a, b) => compareTime(a.time, b.time))
      : [
          {
            time: arrow.startTime,
            displayDate: arrow.startTime,
            points: arrow.points,
            sourceNote: arrow.sourceNote,
          },
        ];
  const previous = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0);
  const next = keyframes.find((frame) => compareTime(frame.time, currentTime) >= 0);
  if (!previous && next) return null;
  if (!previous) return null;

  const base: ArrowKeyframe = { ...previous, points: previous.points.map((point) => ({ ...point })) };
  if (mode !== "linear" || !next || previous.time === next.time) return base;

  const start = parseTimelineSeconds(previous.time);
  const end = parseTimelineSeconds(next.time);
  const current = parseTimelineSeconds(currentTime);
  if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(current) || end <= start) return base;

  const t = Math.min(1, Math.max(0, (current - start) / (end - start)));
  return {
    ...base,
    points: interpolatePointLists(previous.points, next.points, t),
  };
}
