import type { LineCurveMode, MapPoint } from "../../types/project";
import { useProjectStore } from "../../store/projectStore";
import { resolveArrowKeyframe } from "../../utils/interpolation";
import { compareTime, sortedFrames } from "../../utils/time";
import { ColorField, NumberField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

function midpoint(a: MapPoint, b: MapPoint) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function ArrowInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const selectedArrowPointIndices = useProjectStore((state) => state.selectedArrowPointIndices);
  const updateArrow = useProjectStore((state) => state.updateArrow);
  const updateArrowKeyframe = useProjectStore((state) => state.updateArrowKeyframe);
  const deleteArrowKeyframe = useProjectStore((state) => state.deleteArrowKeyframe);
  const clearArrowPointSelection = useProjectStore((state) => state.clearArrowPointSelection);
  const arrow = project.arrows.find((entry) => entry.id === id);
  if (!arrow) return null;

  const frame = resolveArrowKeyframe(arrow, project.timeline.currentTime, project.timeline.interpolationMode);
  const points = frame?.points ?? [];
  const canDeletePoint = points.length > 2;
  const keyframes = [...(arrow.keyframes ?? [])].sort((a, b) => compareTime(a.time, b.time));
  const frames = sortedFrames(project.timeline.frames);
  const selectedPoints = selectedArrowPointIndices
    .filter((index) => index >= 0 && index < points.length)
    .sort((a, b) => a - b);
  const canInsertPoint = selectedPoints.length === 2;

  const insertPointBetweenSelection = () => {
    if (!canInsertPoint) return;
    const [firstIndex, secondIndex] = selectedPoints;
    const nextPoints = [...points];
    nextPoints.splice(secondIndex, 0, midpoint(points[firstIndex], points[secondIndex]));
    updateArrowKeyframe(arrow.id, project.timeline.currentTime, nextPoints);
    clearArrowPointSelection();
  };

  const setDisplayStartTime = (value: string) => {
    updateArrow(arrow.id, {
      startTime: value,
      endTime: compareTime(value, arrow.endTime) > 0 ? value : arrow.endTime,
    });
  };

  const setDisplayEndTime = (value: string) => {
    updateArrow(arrow.id, {
      startTime: compareTime(arrow.startTime, value) > 0 ? value : arrow.startTime,
      endTime: value,
    });
  };

  return (
    <aside className="right-inspector">
      <h2>矢印編集</h2>
      <TextField label="名前" value={arrow.name} onChange={(value) => updateArrow(arrow.id, { name: value })} />
      <ColorField label="色" value={arrow.color} onChange={(value) => updateArrow(arrow.id, { color: value })} />
      <NumberField label="太さ" value={arrow.width} min={1} max={20} onChange={(value) => updateArrow(arrow.id, { width: value })} />
      <NumberField label="先端サイズ" value={arrow.arrowHeadSize ?? 1} min={0.5} max={4} step={0.1} onChange={(value) => updateArrow(arrow.id, { arrowHeadSize: value })} />
      <NumberField label="透明度" value={arrow.opacity} min={0.1} max={1} step={0.05} onChange={(value) => updateArrow(arrow.id, { opacity: value })} />
      <ToggleField label="点線" checked={arrow.dashed} onChange={(value) => updateArrow(arrow.id, { dashed: value })} />
      <label>
        矢印の形
        <select value={arrow.curveMode ?? "straight"} onChange={(event) => updateArrow(arrow.id, { curveMode: event.target.value as LineCurveMode })}>
          <option value="straight">直線</option>
          <option value="curve">曲線</option>
        </select>
      </label>
      <ToggleField label="通常は非表示（ルート確認で表示）" checked={arrow.hideWhenRoute ?? false} onChange={(value) => updateArrow(arrow.id, { hideWhenRoute: value })} />

      <h3>表示期間</h3>
      <label>
        表示開始
        <select value={arrow.startTime} onChange={(event) => setDisplayStartTime(event.target.value)}>
          {frames.map((timelineFrame) => (
            <option value={timelineFrame.time} key={timelineFrame.id}>
              {timelineFrame.displayDate}
            </option>
          ))}
        </select>
      </label>
      <label>
        表示終了
        <select value={arrow.endTime} onChange={(event) => setDisplayEndTime(event.target.value)}>
          {frames.map((timelineFrame) => (
            <option value={timelineFrame.time} key={timelineFrame.id}>
              {timelineFrame.displayDate}
            </option>
          ))}
        </select>
      </label>

      <h3>現在時間の点</h3>
      <button type="button" disabled={!canInsertPoint} onClick={insertPointBetweenSelection}>
        選択した点の間に点を追加
      </button>
      <div className="point-list">
        {points.map((point, index) => (
          <div className={`point-row ${selectedPoints.includes(index) ? "is-selected" : ""}`} key={`${arrow.id}-point-editor-${index}`}>
            <span>点 {index + 1}</span>
            <small>
              x {point.x.toFixed(3)} / y {point.y.toFixed(3)}
            </small>
            <button
              type="button"
              className="icon-only danger"
              disabled={!canDeletePoint}
              onClick={() => {
                updateArrowKeyframe(arrow.id, project.timeline.currentTime, points.filter((_, pointIndex) => pointIndex !== index));
                clearArrowPointSelection();
              }}
            >
              削除
            </button>
          </div>
        ))}
      </div>

      <h3>この矢印のキーフレーム</h3>
      <div className="point-list">
        {keyframes.map((entry, index) => (
          <div className="point-row keyframe-row" key={`${arrow.id}-keyframe-${entry.time}-${index}`}>
            <span>{entry.displayDate || entry.time}</span>
            <small>{entry.points.length} 点</small>
            <button type="button" className="icon-only danger" onClick={() => deleteArrowKeyframe(arrow.id, entry.time)}>
              削除
            </button>
          </div>
        ))}
      </div>

      <TextAreaField label="メモ" value={arrow.memo} onChange={(value) => updateArrow(arrow.id, { memo: value })} />
    </aside>
  );
}
