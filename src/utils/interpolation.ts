import type { ArrowKeyframe, BattleArrow, BattleLine, InterpolationMode, LineKeyframe, Site, SiteKeyframe, Unit, UnitKeyframe } from "../types/project";
import { compareTime, parseTimelineSeconds } from "./time";

export interface ResolvedUnitFrame extends UnitKeyframe {
  effectiveFactionId: string;
  effectiveCertainty: Unit["certainty"];
}

export interface ResolvedSiteFrame extends SiteKeyframe {
  effectiveFactionId: string;
}

function orderedUnitKeyframes(unit: Unit) {
  return [...unit.keyframes].sort((a, b) => compareTime(a.time, b.time));
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

export function resolveUnitFrame(unit: Unit, currentTime: string, mode: InterpolationMode): ResolvedUnitFrame | null {
  const keyframes = orderedUnitKeyframes(unit);
  if (keyframes.length === 0) return null;

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
      effectiveFactionId: factionFrame?.factionId ?? unit.factionId,
      effectiveCertainty: certaintyFrame?.certainty ?? unit.certainty,
    };
  }
  if (!previous) return null;
  const factionFrame = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0 && frame.factionId);
  const certaintyFrame = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0 && frame.certainty);
  const base = { ...previous };

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
            visible: arrow.visible,
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
