import type { TimelineFrame } from "../types/project";

export function sortedFrames(frames: TimelineFrame[]) {
  return [...frames].sort((a, b) => a.order - b.order || a.time.localeCompare(b.time));
}

export function getCurrentFrame(frames: TimelineFrame[], time: string) {
  return sortedFrames(frames).find((frame) => frame.time === time) ?? sortedFrames(frames)[0];
}

export function compareTime(a: string, b: string) {
  return a.localeCompare(b);
}

export function nextFrameTime(frames: TimelineFrame[], currentTime: string, direction: 1 | -1) {
  const ordered = sortedFrames(frames);
  if (ordered.length === 0) return currentTime;
  const index = ordered.findIndex((frame) => frame.time === currentTime);
  const nextIndex = Math.min(Math.max((index === -1 ? 0 : index) + direction, 0), ordered.length - 1);
  return ordered[nextIndex].time;
}
