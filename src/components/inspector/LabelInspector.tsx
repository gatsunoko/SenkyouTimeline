import { useEffect, useRef } from "react";
import { useProjectStore } from "../../store/projectStore";
import { compareTime, sortedFrames } from "../../utils/time";
import { ColorField, NumberField, TextAreaField, ToggleField } from "./InspectorFields";

export function LabelInspector({ id }: { id: string }) {
  const textInputRef = useRef<HTMLInputElement>(null);
  const project = useProjectStore((state) => state.project);
  const tool = useProjectStore((state) => state.tool);
  const updateLabel = useProjectStore((state) => state.updateLabel);
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
  const displayEndTime = label.endTime ?? frames[frames.length - 1]?.time ?? project.timeline.end;

  const setDisplayStartTime = (value: string) => {
    updateLabel(label.id, {
      startTime: value,
      endTime: compareTime(value, displayEndTime) > 0 ? value : displayEndTime,
    });
  };

  const setDisplayEndTime = (value: string) => {
    updateLabel(label.id, {
      startTime: compareTime(displayStartTime, value) > 0 ? value : displayStartTime,
      endTime: value,
    });
  };

  return (
    <aside className="right-inspector">
      <h2>ラベル編集</h2>
      <label>
        テキスト
        <input ref={textInputRef} value={label.text} onChange={(event) => updateLabel(label.id, { text: event.target.value })} />
      </label>
      <label>
        開始時間
        <select value={displayStartTime} onChange={(event) => setDisplayStartTime(event.target.value)}>
          {frames.map((timelineFrame) => (
            <option value={timelineFrame.time} key={timelineFrame.id}>
              {timelineFrame.displayDate}
            </option>
          ))}
        </select>
      </label>
      <label>
        終了時間
        <select value={displayEndTime} onChange={(event) => setDisplayEndTime(event.target.value)}>
          {frames.map((timelineFrame) => (
            <option value={timelineFrame.time} key={timelineFrame.id}>
              {timelineFrame.displayDate}
            </option>
          ))}
        </select>
      </label>
      <div className="coordinate-grid">
        <NumberField label="x" value={label.x} min={0} max={1} step={0.001} onChange={(value) => updateLabel(label.id, { x: value })} />
        <NumberField label="y" value={label.y} min={0} max={1} step={0.001} onChange={(value) => updateLabel(label.id, { y: value })} />
      </div>
      <NumberField label="文字サイズ" value={label.fontSize} min={10} max={72} onChange={(value) => updateLabel(label.id, { fontSize: value })} />
      <ColorField label="文字色" value={label.color} onChange={(value) => updateLabel(label.id, { color: value })} />
      <ColorField label="背景色" value={label.backgroundColor} onChange={(value) => updateLabel(label.id, { backgroundColor: value })} />
      <ColorField label="枠線色" value={label.borderColor} onChange={(value) => updateLabel(label.id, { borderColor: value })} />
      <NumberField label="透明度" value={label.opacity} min={0.1} max={1} step={0.05} onChange={(value) => updateLabel(label.id, { opacity: value })} />
      <ToggleField label="ロック" checked={label.locked} onChange={(value) => updateLabel(label.id, { locked: value })} />
      <TextAreaField label="メモ" value={label.memo} onChange={(value) => updateLabel(label.id, { memo: value })} />
    </aside>
  );
}
