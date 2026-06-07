import type { TimelineFrame } from "../types/project";

export function sortedFrames(frames: TimelineFrame[]) {
  return [...frames].sort((a, b) => compareTime(a.time, b.time) || a.order - b.order);
}

export function getCurrentFrame(frames: TimelineFrame[], time: string) {
  return sortedFrames(frames).find((frame) => frame.time === time) ?? sortedFrames(frames)[0];
}

export function parseTimelineSeconds(time: string): number {
  const raw = String(time).trim();
  const numeric = Number(raw.replace(/s$/i, ""));
  if (Number.isFinite(numeric)) return numeric;

  const timecode = raw.match(/^(\d{1,2}):(\d{2})(?:\.(\d+))?$/);
  if (timecode) {
    const minutes = Number(timecode[1]);
    const seconds = Number(timecode[2]);
    const fraction = Number(`0.${timecode[3] ?? "0"}`);
    return minutes * 60 + seconds + fraction;
  }

  const parsedDate = Date.parse(raw);
  return Number.isNaN(parsedDate) ? 0 : parsedDate / 1000;
}

export function compareTime(a: string, b: string) {
  const aSeconds = parseTimelineSeconds(a);
  const bSeconds = parseTimelineSeconds(b);
  const diff = aSeconds - bSeconds;
  return Math.abs(diff) < 0.0001 ? 0 : diff;
}

export function formatSeconds(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds - minutes * 60;
  const whole = Math.floor(remainder);
  const tenths = Math.round((remainder - whole) * 10);
  const normalizedWhole = tenths === 10 ? whole + 1 : whole;
  const normalizedTenths = tenths === 10 ? 0 : tenths;
  return `${minutes.toString().padStart(2, "0")}:${normalizedWhole.toString().padStart(2, "0")}.${normalizedTenths}`;
}

export function formatTimelineLabel(time: string) {
  return formatSeconds(parseTimelineSeconds(time));
}

export function getTimelineBounds(frames: TimelineFrame[], start: string, end: string) {
  const values = [parseTimelineSeconds(start), parseTimelineSeconds(end), ...frames.map((frame) => parseTimelineSeconds(frame.time))];
  const finite = values.filter(Number.isFinite);
  return {
    start: Math.min(...finite, 0),
    end: Math.max(...finite, 10),
  };
}

export function nextFrameTime(frames: TimelineFrame[], currentTime: string, direction: 1 | -1) {
  const ordered = sortedFrames(frames);
  if (ordered.length === 0) return currentTime;
  const currentSeconds = parseTimelineSeconds(currentTime);
  const index =
    direction > 0
      ? ordered.findIndex((frame) => parseTimelineSeconds(frame.time) > currentSeconds)
      : [...ordered].reverse().findIndex((frame) => parseTimelineSeconds(frame.time) < currentSeconds);

  if (direction > 0) {
    const nextIndex = index === -1 ? ordered.length - 1 : index;
    return ordered[nextIndex].time;
  }

  const reverseIndex = index === -1 ? ordered.length - 1 : index;
  const nextIndex = ordered.length - 1 - reverseIndex;
  return ordered[nextIndex].time;
}
