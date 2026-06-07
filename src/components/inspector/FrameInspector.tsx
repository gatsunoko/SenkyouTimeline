import { useProjectStore } from "../../store/projectStore";
import { formatTimelineLabel, parseTimelineSeconds } from "../../utils/time";
import { NumberField, TextAreaField, TextField } from "./InspectorFields";

export function FrameInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const updateTimelineFrame = useProjectStore((state) => state.updateTimelineFrame);
  const frame = project.timeline.frames.find((entry) => entry.id === id);
  if (!frame) return null;

  const seconds = parseTimelineSeconds(frame.time);

  return (
    <aside className="right-inspector">
      <h2>キーフレーム編集</h2>
      <NumberField
        label="秒数"
        value={seconds}
        min={0}
        step={0.1}
        onChange={(value) => updateTimelineFrame(frame.id, { time: value.toFixed(1) })}
      />
      <TextField
        label="表示名"
        value={frame.displayDate}
        onChange={(value) => updateTimelineFrame(frame.id, { displayDate: value })}
      />
      <button type="button" onClick={() => updateTimelineFrame(frame.id, { displayDate: formatTimelineLabel(frame.time) })}>
        秒数表示に戻す
      </button>
      <TextAreaField
        label="説明テキスト"
        value={frame.memo}
        onChange={(value) => updateTimelineFrame(frame.id, { memo: value })}
      />
    </aside>
  );
}
