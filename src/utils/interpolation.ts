import type { BattleLine, InterpolationMode, LineKeyframe, Unit, UnitKeyframe } from "../types/project";
import { compareTime } from "./time";

export interface ResolvedUnitFrame extends UnitKeyframe {
  effectiveFactionId: string;
  effectiveCertainty: Unit["certainty"];
}

function orderedUnitKeyframes(unit: Unit) {
  return [...unit.keyframes].sort((a, b) => compareTime(a.time, b.time));
}

export function resolveUnitFrame(unit: Unit, currentTime: string, mode: InterpolationMode): ResolvedUnitFrame | null {
  const keyframes = orderedUnitKeyframes(unit);
  if (keyframes.length === 0) return null;

  const previous = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0);
  const next = keyframes.find((frame) => compareTime(frame.time, currentTime) >= 0);

  if (!previous && next) return null;
  if (!previous) return null;
  const factionFrame = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0 && frame.factionId);
  const certaintyFrame = [...keyframes].reverse().find((frame) => compareTime(frame.time, currentTime) <= 0 && frame.certainty);
  const base = { ...previous };

  if (mode === "linear" && next && previous.time !== next.time) {
    const start = Date.parse(previous.time);
    const end = Date.parse(next.time);
    const current = Date.parse(currentTime);
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

export function resolveLineKeyframe(line: BattleLine, currentTime: string): LineKeyframe | null {
  return (
    [...line.keyframes]
      .sort((a, b) => compareTime(a.time, b.time))
      .reverse()
      .find((frame) => compareTime(frame.time, currentTime) <= 0) ?? null
  );
}
