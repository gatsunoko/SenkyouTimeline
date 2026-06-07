import type { MapPoint } from "../../types/project";
import { useProjectStore } from "../../store/projectStore";
import { resolveLineKeyframe } from "../../utils/interpolation";
import { compareTime, sortedFrames } from "../../utils/time";
import { ColorField, NumberField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

function midpoint(a: MapPoint, b: MapPoint) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function LineInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const selectedLinePointIndices = useProjectStore((state) => state.selectedLinePointIndices);
  const updateLine = useProjectStore((state) => state.updateLine);
  const updateLineKeyframe = useProjectStore((state) => state.updateLineKeyframe);
  const deleteLineKeyframe = useProjectStore((state) => state.deleteLineKeyframe);
  const clearLinePointSelection = useProjectStore((state) => state.clearLinePointSelection);
  const line = project.lines.find((entry) => entry.id === id);
  if (!line) return null;

  const frame = resolveLineKeyframe(line, project.timeline.currentTime, project.timeline.interpolationMode);
  const points = frame?.points ?? [];
  const canDeletePoint = points.length > 2;
  const keyframes = [...line.keyframes].sort((a, b) => compareTime(a.time, b.time));
  const frames = sortedFrames(project.timeline.frames);
  const displayStartTime = line.displayStartTime ?? keyframes[0]?.time ?? frames[0]?.time ?? project.timeline.currentTime;
  const displayEndTime = line.displayEndTime ?? frames[frames.length - 1]?.time ?? project.timeline.end;
  const selectedPoints = selectedLinePointIndices
    .filter((index) => index >= 0 && index < points.length)
    .sort((a, b) => a - b);
  const canInsertPoint = selectedPoints.length === 2;

  const insertPointBetweenSelection = () => {
    if (!canInsertPoint) return;
    const [firstIndex, secondIndex] = selectedPoints;
    const nextPoints = [...points];
    nextPoints.splice(secondIndex, 0, midpoint(points[firstIndex], points[secondIndex]));
    updateLineKeyframe(line.id, project.timeline.currentTime, nextPoints);
    clearLinePointSelection();
  };

  const setDisplayStartTime = (value: string) => {
    updateLine(line.id, {
      displayStartTime: value,
      displayEndTime: compareTime(value, displayEndTime) > 0 ? value : displayEndTime,
    });
  };

  const setDisplayEndTime = (value: string) => {
    updateLine(line.id, {
      displayStartTime: compareTime(displayStartTime, value) > 0 ? value : displayStartTime,
      displayEndTime: value,
    });
  };

  return (
    <aside className="right-inspector">
      <h2>線編集</h2>
      <TextField label="名称" value={line.name} onChange={(value) => updateLine(line.id, { name: value })} />
      <ColorField label="色" value={line.color} onChange={(value) => updateLine(line.id, { color: value })} />
      <NumberField label="太さ" value={line.width} min={1} max={20} onChange={(value) => updateLine(line.id, { width: value })} />
      <NumberField label="透明度" value={line.opacity} min={0.1} max={1} step={0.05} onChange={(value) => updateLine(line.id, { opacity: value })} />
      <ToggleField label="点線" checked={line.dashed} onChange={(value) => updateLine(line.id, { dashed: value })} />

      <h3>表示期間</h3>
      <label>
        表示開始
        <select value={displayStartTime} onChange={(event) => setDisplayStartTime(event.target.value)}>
          {frames.map((timelineFrame) => (
            <option value={timelineFrame.time} key={timelineFrame.id}>
              {timelineFrame.displayDate}
            </option>
          ))}
        </select>
      </label>
      <label>
        表示終了
        <select value={displayEndTime} onChange={(event) => setDisplayEndTime(event.target.value)}>
          {frames.map((timelineFrame) => (
            <option value={timelineFrame.time} key={timelineFrame.id}>
              {timelineFrame.displayDate}
            </option>
          ))}
        </select>
      </label>

      <h3>現在時間の点</h3>
      <button type="button" disabled={!canInsertPoint} onClick={insertPointBetweenSelection}>
        選択した2点の間に点を追加
      </button>
      <div className="point-list">
        {points.map((point, index) => (
          <div className={`point-row ${selectedPoints.includes(index) ? "is-selected" : ""}`} key={`${line.id}-point-editor-${index}`}>
            <span>点 {index + 1}</span>
            <small>
              x {point.x.toFixed(3)} / y {point.y.toFixed(3)}
            </small>
            <button
              type="button"
              className="icon-only danger"
              disabled={!canDeletePoint}
              onClick={() => {
                updateLineKeyframe(line.id, project.timeline.currentTime, points.filter((_, pointIndex) => pointIndex !== index));
                clearLinePointSelection();
              }}
            >
              削除
            </button>
          </div>
        ))}
      </div>

      <h3>この線のキーフレーム</h3>
      <div className="point-list">
        {keyframes.map((entry, index) => (
          <div className="point-row keyframe-row" key={`${line.id}-keyframe-${entry.time}-${index}`}>
            <span>{entry.displayDate || entry.time}</span>
            <small>{entry.points.length} 点</small>
            <button type="button" className="icon-only danger" onClick={() => deleteLineKeyframe(line.id, entry.time)}>
              削除
            </button>
          </div>
        ))}
      </div>

      <TextAreaField label="メモ" value={line.memo} onChange={(value) => updateLine(line.id, { memo: value })} />
    </aside>
  );
}
