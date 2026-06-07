import { useEffect, useState } from "react";
import { Pause, Play, Plus, SkipBack, SkipForward, Trash2 } from "lucide-react";
import { useProjectStore } from "../../store/projectStore";
import { createId } from "../../utils/id";
import { sortedFrames } from "../../utils/time";

export function TimelinePanel() {
  const project = useProjectStore((state) => state.project);
  const setCurrentTime = useProjectStore((state) => state.setCurrentTime);
  const moveFrame = useProjectStore((state) => state.moveFrame);
  const setInterpolationMode = useProjectStore((state) => state.setInterpolationMode);
  const loadProject = useProjectStore((state) => state.loadProject);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(900);
  const frames = sortedFrames(project.timeline.frames);
  const currentIndex = frames.findIndex((frame) => frame.time === project.timeline.currentTime);
  const currentFrame = frames[currentIndex] ?? frames[0];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const index = frames.findIndex((frame) => frame.time === project.timeline.currentTime);
      if (index < frames.length - 1) {
        setCurrentTime(frames[index + 1].time);
      } else if (loop && frames[0]) {
        setCurrentTime(frames[0].time);
      } else {
        setPlaying(false);
      }
    }, speed);
    return () => window.clearInterval(timer);
  }, [frames, loop, playing, project.timeline.currentTime, setCurrentTime, speed]);

  const addFrame = () => {
    const next = structuredClone(project);
    const order = frames.length + 1;
    const time = `custom-${order}`;
    next.timeline.frames.push({
      id: createId("frame"),
      time,
      displayDate: `追加日付${order}`,
      order,
      memo: "",
    });
    next.timeline.currentTime = time;
    loadProject(next);
  };

  const deleteFrame = () => {
    if (!currentFrame || frames.length <= 1) return;
    const next = structuredClone(project);
    next.timeline.frames = next.timeline.frames.filter((frame) => frame.id !== currentFrame.id);
    next.timeline.currentTime = next.timeline.frames[0]?.time ?? "";
    loadProject(next);
  };

  return (
    <footer className="timeline-panel">
      <div className="timeline-controls">
        <strong>{currentFrame?.displayDate ?? "日付なし"}</strong>
        <span>{currentFrame?.time}</span>
        <button type="button" onClick={() => moveFrame(-1)} title="前の日付">
          <SkipBack size={16} /> 前
        </button>
        <button type="button" onClick={() => moveFrame(1)} title="次の日付">
          <SkipForward size={16} /> 次
        </button>
        <button type="button" onClick={() => setPlaying((value) => !value)} title={playing ? "停止" : "再生"}>
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
          <input type="range" min="250" max="1800" step="50" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} />
        </label>
        <button type="button" onClick={addFrame}>
          <Plus size={16} /> フレーム追加
        </button>
        <button type="button" onClick={deleteFrame}>
          <Trash2 size={16} /> フレーム削除
        </button>
      </div>
      <div className="frame-strip">
        {frames.map((frame, index) => (
          <button
            type="button"
            className={frame.time === project.timeline.currentTime ? "is-active" : ""}
            key={frame.id}
            onClick={() => setCurrentTime(frame.time)}
          >
            <span>{index + 1}</span>
            <strong>{frame.displayDate}</strong>
            <small>{frame.time}</small>
          </button>
        ))}
      </div>
    </footer>
  );
}
