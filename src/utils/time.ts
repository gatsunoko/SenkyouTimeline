import type { TimelineFrame } from "../types/project";

export function sortedFrames(frames: TimelineFrame[]) {
  return [...frames].sort((a, b) => compareTime(a.time, b.time) || a.order - b.order);
}

export function getCurrentFrame(frames: TimelineFrame[], time: string) {
  const ordered = sortedFrames(frames);
  const currentSeconds = parseTimelineSeconds(time);
  return ordered.find((frame) => Math.abs(parseTimelineSeconds(frame.time) - currentSeconds) < 0.05) ?? ordered[0];
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

export function getTimelineBounds(start: string, end: string) {
  const startSeconds = parseTimelineSeconds(start);
  const endSeconds = parseTimelineSeconds(end);
  const safeStart = Number.isFinite(startSeconds) ? Math.max(0, startSeconds) : 0;
  const safeEnd = Number.isFinite(endSeconds) ? Math.max(safeStart, endSeconds) : Math.max(safeStart, 10);
  return {
    start: safeStart,
    end: safeEnd,
  };
}
