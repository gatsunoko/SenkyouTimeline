import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useProjectStore } from "../../store/projectStore";
import { formatSeconds, getTimelineBounds, parseTimelineSeconds } from "../../utils/time";

export function TimelinePanel() {
  const project = useProjectStore((state) => state.project);
  const setCurrentTime = useProjectStore((state) => state.setCurrentTime);
  const setTimelineEnd = useProjectStore((state) => state.setTimelineEnd);
  const setInterpolationMode = useProjectStore((state) => state.setInterpolationMode);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [endDraft, setEndDraft] = useState(() => parseTimelineSeconds(project.timeline.end).toFixed(1));
  const lastTickRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const currentSeconds = parseTimelineSeconds(project.timeline.currentTime);
  const bounds = getTimelineBounds(project.timeline.start, project.timeline.end);

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

  useEffect(() => {
    setEndDraft(parseTimelineSeconds(project.timeline.end).toFixed(1));
  }, [project.timeline.end]);

  const commitEndDraft = () => {
    const value = Number(endDraft);
    if (!Number.isFinite(value)) {
      setEndDraft(parseTimelineSeconds(project.timeline.end).toFixed(1));
      return;
    }
    const normalized = Math.max(0, value).toFixed(1);
    setEndDraft(normalized);
    setTimelineEnd(value);
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
        <label className="timeline-end-control">
          終了秒数
          <input
            type="number"
            min={0}
            step={0.1}
            value={endDraft}
            onChange={(event) => setEndDraft(event.target.value)}
            onBlur={commitEndDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </label>
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
    </footer>
  );
}
