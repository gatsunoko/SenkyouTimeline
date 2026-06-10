import { useEffect, useRef, useState } from "react";
import { Pause, Play, Plus, SkipBack, SkipForward, Trash2 } from "lucide-react";
import { useProjectStore } from "../../store/projectStore";
import { getUnitRouteTimeRange, resolveArrowRoutePoints, resolveLineRoutePoints, resolveUnitFrame } from "../../utils/interpolation";
import { formatSeconds, formatTimelineLabel, getTimelineBounds, parseTimelineSeconds, sortedFrames } from "../../utils/time";

export function TimelinePanel() {
  const project = useProjectStore((state) => state.project);
  const setCurrentTime = useProjectStore((state) => state.setCurrentTime);
  const selectObject = useProjectStore((state) => state.selectObject);
  const moveFrame = useProjectStore((state) => state.moveFrame);
  const addTimelineKeyframe = useProjectStore((state) => state.addTimelineKeyframe);
  const setInterpolationMode = useProjectStore((state) => state.setInterpolationMode);
  const loadProject = useProjectStore((state) => state.loadProject);
  const selected = useProjectStore((state) => state.selected);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const lastTickRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const frames = sortedFrames(project.timeline.frames);
  const currentSeconds = parseTimelineSeconds(project.timeline.currentTime);
  const bounds = getTimelineBounds(frames, project.timeline.start, project.timeline.end);
  const activeFrame = frames.find((frame) => Math.abs(parseTimelineSeconds(frame.time) - currentSeconds) < 0.05);

  useEffect(() => {
    if (!playing) {
      lastTickRef.current = null;
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const tick = () => {
      const now = performance.now();
      const last = lastTickRef.current ?? now;
      lastTickRef.current = now;
      const deltaSeconds = ((now - last) / 1000) * playbackRate;
      const latestSeconds = parseTimelineSeconds(useProjectStore.getState().project.timeline.currentTime);
      const nextSeconds = latestSeconds + deltaSeconds;

      if (nextSeconds <= bounds.end) {
        setCurrentTime(nextSeconds.toFixed(4));
        animationFrameRef.current = window.requestAnimationFrame(tick);
      } else if (loop) {
        setCurrentTime(bounds.start.toFixed(4));
        lastTickRef.current = performance.now();
        animationFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        setCurrentTime(bounds.end.toFixed(4));
        setPlaying(false);
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastTickRef.current = null;
    };
  }, [bounds.end, bounds.start, loop, playbackRate, playing, setCurrentTime]);

  const deleteFrame = () => {
    if (!activeFrame || frames.length <= 1) return;
    const deletedSeconds = parseTimelineSeconds(activeFrame.time);
    const next = structuredClone(project);
    next.timeline.frames = next.timeline.frames
      .filter((frame) => frame.id !== activeFrame.id)
      .map((frame, index) => ({ ...frame, order: index + 1 }));
    const remainingFrames = sortedFrames(next.timeline.frames);
    const previousFrame = [...remainingFrames].reverse().find((frame) => parseTimelineSeconds(frame.time) < deletedSeconds);
    const nextFrame = remainingFrames.find((frame) => parseTimelineSeconds(frame.time) > deletedSeconds);
    const fallbackStart = remainingFrames[0]?.time ?? "0";
    const fallbackEnd = remainingFrames[remainingFrames.length - 1]?.time ?? fallbackStart;
    const replacementStart = nextFrame?.time ?? previousFrame?.time ?? fallbackStart;
    const replacementEnd = previousFrame?.time ?? nextFrame?.time ?? fallbackEnd;
    const isDeletedTime = (time?: string) => Boolean(time && Math.abs(parseTimelineSeconds(time) - deletedSeconds) < 0.05);
    const updateRouteFallbackPoints = (unit: (typeof next.units)[number]) => {
      if (!unit.route) return;
      const segments = unit.route.segments && unit.route.segments.length > 0 ? unit.route.segments : [unit.route];
      for (const segment of segments) {
        if (segment.sourceType === "line") {
          const line = next.lines.find((entry) => entry.id === segment.sourceId);
          const points = line ? resolveLineRoutePoints(line, activeFrame.time, next.timeline.interpolationMode) : null;
          segment.fallbackPoints = points?.map((point) => ({ ...point })) ?? segment.fallbackPoints;
        } else {
          const arrow = next.arrows.find((entry) => entry.id === segment.sourceId);
          const points = arrow ? resolveArrowRoutePoints(arrow, activeFrame.time, next.timeline.interpolationMode) : null;
          segment.fallbackPoints = points?.map((point) => ({ ...point })) ?? segment.fallbackPoints;
        }
      }
      const first = segments[0];
      Object.assign(unit.route, first);
      unit.route.segments = segments;
    };

    for (const unit of next.units) {
      updateRouteFallbackPoints(unit);
      const routeRange = getUnitRouteTimeRange(unit.route);
      const resolvedBeforeDelete = resolveUnitFrame(unit, activeFrame.time, next.timeline.interpolationMode);
      unit.keyframes = unit.keyframes.filter((keyframe) => !isDeletedTime(keyframe.time));
      if (unit.keyframes.length === 0 && resolvedBeforeDelete) {
        unit.x = resolvedBeforeDelete.x;
        unit.y = resolvedBeforeDelete.y;
        unit.rotation = resolvedBeforeDelete.rotation;
        unit.size = resolvedBeforeDelete.size ?? unit.size;
        unit.status = resolvedBeforeDelete.status;
        unit.factionId = resolvedBeforeDelete.effectiveFactionId;
        unit.certainty = resolvedBeforeDelete.effectiveCertainty;
        unit.sourceNote = resolvedBeforeDelete.sourceNote ?? unit.sourceNote;
      }
      if (isDeletedTime(unit.displayStartTime)) unit.displayStartTime = routeRange?.startTime ?? replacementStart;
      if (isDeletedTime(unit.displayEndTime)) unit.displayEndTime = routeRange?.endTime ?? replacementEnd;
    }

    for (const site of next.sites) {
      site.keyframes = site.keyframes?.filter((keyframe) => !isDeletedTime(keyframe.time)) ?? [];
    }

    for (const line of next.lines) {
      line.keyframes = line.keyframes.filter((keyframe) => !isDeletedTime(keyframe.time));
      if (isDeletedTime(line.displayStartTime)) line.displayStartTime = replacementStart;
      if (isDeletedTime(line.displayEndTime)) line.displayEndTime = replacementEnd;
    }

    for (const arrow of next.arrows) {
      arrow.keyframes = arrow.keyframes?.filter((keyframe) => !isDeletedTime(keyframe.time)) ?? [];
      if (isDeletedTime(arrow.startTime)) arrow.startTime = replacementStart;
      if (isDeletedTime(arrow.endTime)) arrow.endTime = replacementEnd;
    }

    for (const label of next.labels) {
      if (isDeletedTime(label.startTime)) label.startTime = replacementStart;
      if (isDeletedTime(label.endTime)) label.endTime = replacementEnd;
    }

    next.timeline.currentTime = previousFrame?.time ?? nextFrame?.time ?? fallbackStart;
    next.timeline.start = fallbackStart;
    next.timeline.end = fallbackEnd;
    loadProject(next);
  };

  const togglePlayback = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (currentSeconds >= bounds.end - 0.0001) {
      setCurrentTime(bounds.start.toFixed(4));
    }
    setPlaying(true);
  };

  return (
    <footer className="timeline-panel">
      <div className="timeline-controls">
        <strong>{formatSeconds(currentSeconds)}</strong>
        <span>{activeFrame ? `キーフレーム: ${activeFrame.displayDate}` : "任意の時間"}</span>
        <button type="button" onClick={() => moveFrame(-1)} title="前のキーフレーム">
          <SkipBack size={16} /> 前
        </button>
        <button type="button" onClick={() => moveFrame(1)} title="次のキーフレーム">
          <SkipForward size={16} /> 次
        </button>
        <button type="button" onClick={togglePlayback} title={playing ? "停止" : "再生"}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
          {playing ? "停止" : "再生"}
        </button>
        <label>
          <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
          ループ
        </label>
        <label>
          補間
          <select value={project.timeline.interpolationMode} onChange={(event) => setInterpolationMode(event.target.value as "none" | "linear")}>
            <option value="none">なし</option>
            <option value="linear">線形</option>
          </select>
        </label>
        <label>
          速度
          <input type="range" min="0.25" max="4" step="0.25" value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))} />
          <b>{playbackRate.toFixed(2)}x</b>
        </label>
        <button type="button" onClick={addTimelineKeyframe}>
          <Plus size={16} /> キーフレーム追加
        </button>
        <button type="button" onClick={deleteFrame} disabled={!activeFrame || frames.length <= 1}>
          <Trash2 size={16} /> キーフレーム削除
        </button>
      </div>
      <div className="time-ruler">
        <span>{formatSeconds(bounds.start)}</span>
        <input
          type="range"
          min={bounds.start}
          max={bounds.end}
          step="0.1"
          value={Math.min(bounds.end, Math.max(bounds.start, currentSeconds))}
          onChange={(event) => setCurrentTime(Number(event.target.value).toFixed(1))}
        />
        <span>{formatSeconds(bounds.end)}</span>
      </div>
      <div className="frame-strip">
        {frames.map((frame, index) => (
          <button
            type="button"
            className={`${Math.abs(parseTimelineSeconds(frame.time) - currentSeconds) < 0.05 ? "is-active" : ""} ${selected.type === "frame" && selected.id === frame.id ? "is-selected" : ""}`}
            key={frame.id}
            onClick={() => {
              setCurrentTime(frame.time);
              selectObject("frame", frame.id);
            }}
          >
            <span>{index + 1}</span>
            <strong>{formatTimelineLabel(frame.time)}</strong>
            {frame.memo && <small>{frame.memo}</small>}
          </button>
        ))}
      </div>
    </footer>
  );
}
