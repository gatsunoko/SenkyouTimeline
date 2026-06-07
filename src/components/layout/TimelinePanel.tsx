import { useEffect, useRef, useState } from "react";
import { Pause, Play, Plus, SkipBack, SkipForward, Trash2 } from "lucide-react";
import { useProjectStore } from "../../store/projectStore";
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
    const next = structuredClone(project);
    next.timeline.frames = next.timeline.frames
      .filter((frame) => frame.id !== activeFrame.id)
      .map((frame, index) => ({ ...frame, order: index + 1 }));
    next.timeline.currentTime = Math.min(currentSeconds, parseTimelineSeconds(next.timeline.end)).toFixed(1);
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
