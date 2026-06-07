import type { MapPoint } from "../../types/project";
import { useProjectStore } from "../../store/projectStore";
import { resolveArrowKeyframe } from "../../utils/interpolation";
import { ColorField, NumberField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

function insertedPoint(points: MapPoint[]) {
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  const last = points[points.length - 1];
  const previous = points[points.length - 2] ?? last;
  return {
    x: (previous.x + last.x) / 2,
    y: (previous.y + last.y) / 2,
  };
}

export function ArrowInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const updateArrow = useProjectStore((state) => state.updateArrow);
  const updateArrowKeyframe = useProjectStore((state) => state.updateArrowKeyframe);
  const arrow = project.arrows.find((entry) => entry.id === id);
  if (!arrow) return null;

  const frame = resolveArrowKeyframe(arrow, project.timeline.currentTime, project.timeline.interpolationMode);
  const points = frame?.points ?? [];
  const canDeletePoint = points.length > 2;

  return (
    <aside className="right-inspector">
      <h2>矢印編集</h2>
      <TextField label="名称" value={arrow.name} onChange={(value) => updateArrow(arrow.id, { name: value })} />
      <ColorField label="色" value={arrow.color} onChange={(value) => updateArrow(arrow.id, { color: value })} />
      <NumberField label="太さ" value={arrow.width} min={1} max={20} onChange={(value) => updateArrow(arrow.id, { width: value })} />
      <NumberField label="透明度" value={arrow.opacity} min={0.1} max={1} step={0.05} onChange={(value) => updateArrow(arrow.id, { opacity: value })} />
      <ToggleField label="点線" checked={arrow.dashed} onChange={(value) => updateArrow(arrow.id, { dashed: value })} />

      <h3>現在時間の点</h3>
      <button type="button" onClick={() => updateArrowKeyframe(arrow.id, project.timeline.currentTime, [...points, insertedPoint(points)])}>
        点を追加
      </button>
      <div className="point-list">
        {points.map((point, index) => (
          <div className="point-row" key={`${arrow.id}-point-editor-${index}`}>
            <span>点 {index + 1}</span>
            <small>
              x {point.x.toFixed(3)} / y {point.y.toFixed(3)}
            </small>
            <button
              type="button"
              className="icon-only danger"
              disabled={!canDeletePoint}
              onClick={() => updateArrowKeyframe(arrow.id, project.timeline.currentTime, points.filter((_, pointIndex) => pointIndex !== index))}
            >
              削除
            </button>
          </div>
        ))}
      </div>

      <TextAreaField label="メモ" value={arrow.memo} onChange={(value) => updateArrow(arrow.id, { memo: value })} />
    </aside>
  );
}
