import { compareTime, parseTimelineSeconds } from "../../utils/time";
import { NumberField } from "./InspectorFields";

function secondsOf(time: string | undefined, fallback: string) {
  const parsed = parseTimelineSeconds(time ?? fallback);
  if (Number.isFinite(parsed)) return parsed;
  const fallbackSeconds = parseTimelineSeconds(fallback);
  return Number.isFinite(fallbackSeconds) ? fallbackSeconds : 0;
}

function secondsToTime(value: number) {
  return Number(value).toFixed(1);
}

export function DisplayPeriodFields({
  startTime,
  endTime,
  fallbackStartTime,
  fallbackEndTime,
  onChange,
  startLabel = "表示開始",
  endLabel = "表示終了",
}: {
  startTime?: string;
  endTime?: string;
  fallbackStartTime: string;
  fallbackEndTime: string;
  onChange: (patch: { startTime: string; endTime: string }) => void;
  startLabel?: string;
  endLabel?: string;
}) {
  const resolvedStartTime = startTime ?? fallbackStartTime;
  const resolvedEndTime = endTime ?? fallbackEndTime;
  const startSeconds = secondsOf(resolvedStartTime, fallbackStartTime);
  const endSeconds = secondsOf(resolvedEndTime, fallbackEndTime);

  const setStartSeconds = (value: number) => {
    const nextStartTime = secondsToTime(Math.max(0, value));
    onChange({
      startTime: nextStartTime,
      endTime: compareTime(nextStartTime, resolvedEndTime) > 0 ? nextStartTime : resolvedEndTime,
    });
  };

  const setEndSeconds = (value: number) => {
    const nextEndTime = secondsToTime(Math.max(0, value));
    onChange({
      startTime: compareTime(resolvedStartTime, nextEndTime) > 0 ? nextEndTime : resolvedStartTime,
      endTime: nextEndTime,
    });
  };

  return (
    <>
      <NumberField label={startLabel} value={startSeconds} min={0} step={0.1} onChange={setStartSeconds} />
      <NumberField label={endLabel} value={endSeconds} min={0} step={0.1} onChange={setEndSeconds} />
    </>
  );
}
