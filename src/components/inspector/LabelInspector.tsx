import { useEffect, useRef } from "react";
import { useProjectStore } from "../../store/projectStore";
import { resolveLabelFrame } from "../../utils/interpolation";
import { compareTime, sortedFrames } from "../../utils/time";
import { DisplayPeriodFields } from "./DisplayPeriodFields";
import { ColorField, NumberField, TextAreaField, ToggleField } from "./InspectorFields";

export function LabelInspector({ id }: { id: string }) {
  const textInputRef = useRef<HTMLInputElement>(null);
  const project = useProjectStore((state) => state.project);
  const tool = useProjectStore((state) => state.tool);
  const updateLabel = useProjectStore((state) => state.updateLabel);
  const updateLabelKeyframe = useProjectStore((state) => state.updateLabelKeyframe);
  const deleteLabelKeyframe = useProjectStore((state) => state.deleteLabelKeyframe);
  const label = project.labels.find((entry) => entry.id === id);

  useEffect(() => {
    if (tool !== "addLabel") return;
    window.requestAnimationFrame(() => {
      textInputRef.current?.focus();
      textInputRef.current?.select();
    });
  }, [id, tool]);

  if (!label) return null;

  const frames = sortedFrames(project.timeline.frames);
  const displayStartTime = label.startTime ?? frames[0]?.time ?? project.timeline.currentTime;
  const displayEndTime = label.endTime ?? project.timeline.end;
  const frame = resolveLabelFrame(label, project.timeline.currentTime, project.timeline.interpolationMode);
  const keyframes = [...(label.keyframes ?? [])].sort((a, b) => compareTime(a.time, b.time));

  return (
    <aside className="right-inspector">
      <h2>ラベル編集</h2>
      <label>
        テキスト
        <input ref={textInputRef} value={label.text} onChange={(event) => updateLabel(label.id, { text: event.target.value })} />
      </label>
      <DisplayPeriodFields
        startTime={label.startTime}
        endTime={label.endTime}
        fallbackStartTime={displayStartTime}
        fallbackEndTime={displayEndTime}
        onChange={(patch) => updateLabel(label.id, { startTime: patch.startTime, endTime: patch.endTime })}
      />
      <div className="coordinate-grid">
        <NumberField label="x" value={frame.x} min={0} max={1} step={0.001} onChange={(value) => updateLabelKeyframe(label.id, project.timeline.currentTime, { x: value, y: frame.y })} />
        <NumberField label="y" value={frame.y} min={0} max={1} step={0.001} onChange={(value) => updateLabelKeyframe(label.id, project.timeline.currentTime, { x: frame.x, y: value })} />
      </div>
      <NumberField label="文字サイズ" value={label.fontSize} min={10} max={72} onChange={(value) => updateLabel(label.id, { fontSize: value })} />
      <ToggleField label="文字を太字" checked={label.bold ?? false} onChange={(value) => updateLabel(label.id, { bold: value })} />
      <ColorField label="文字色" value={label.color} onChange={(value) => updateLabel(label.id, { color: value })} />
      <ToggleField label="背景色を表示" checked={label.backgroundEnabled ?? true} onChange={(value) => updateLabel(label.id, { backgroundEnabled: value })} />
      {(label.backgroundEnabled ?? true) && <ColorField label="背景色" value={label.backgroundColor} onChange={(value) => updateLabel(label.id, { backgroundColor: value })} />}
      <ToggleField label="文字にアウトライン" checked={label.outlineEnabled ?? false} onChange={(value) => updateLabel(label.id, { outlineEnabled: value })} />
      {label.outlineEnabled && <ColorField label="アウトライン色" value={label.outlineColor ?? "#111827"} onChange={(value) => updateLabel(label.id, { outlineColor: value })} />}
      <ToggleField label="枠線を表示" checked={label.borderEnabled ?? true} onChange={(value) => updateLabel(label.id, { borderEnabled: value })} />
      {(label.borderEnabled ?? true) && <ColorField label="枠線色" value={label.borderColor} onChange={(value) => updateLabel(label.id, { borderColor: value })} />}
      <NumberField label="透明度" value={label.opacity} min={0.1} max={1} step={0.05} onChange={(value) => updateLabel(label.id, { opacity: value })} />
      <ToggleField label="ロック" checked={label.locked} onChange={(value) => updateLabel(label.id, { locked: value })} />

      <h3>座標キーフレーム</h3>
      <button type="button" onClick={() => updateLabelKeyframe(label.id, project.timeline.currentTime, { x: frame.x, y: frame.y })}>
        現在の座標をキーに追加/更新
      </button>
      <div className="point-list">
        {keyframes.map((entry, index) => (
          <div className="point-row keyframe-row" key={`${label.id}-label-keyframe-${entry.time}-${index}`}>
            <span>{entry.displayDate || entry.time}</span>
            <small>
              X {entry.x.toFixed(3)} / Y {entry.y.toFixed(3)}
            </small>
            <button type="button" className="icon-only danger" onClick={() => deleteLabelKeyframe(label.id, entry.time)}>
              削除
            </button>
          </div>
        ))}
      </div>

      <TextAreaField label="メモ" value={label.memo} onChange={(value) => updateLabel(label.id, { memo: value })} />
    </aside>
  );
}
