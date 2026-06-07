import { useEffect, useState } from "react";
import { useProjectStore } from "../../store/projectStore";
import { formatTimelineLabel, parseTimelineSeconds } from "../../utils/time";
import { TextAreaField, TextField } from "./InspectorFields";

export function FrameInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const updateTimelineFrame = useProjectStore((state) => state.updateTimelineFrame);
  const frame = project.timeline.frames.find((entry) => entry.id === id);
  const seconds = frame ? parseTimelineSeconds(frame.time) : 0;
  const [secondsDraft, setSecondsDraft] = useState(seconds.toFixed(1));

  useEffect(() => {
    setSecondsDraft(seconds.toFixed(1));
  }, [id, seconds]);

  if (!frame) return null;

  const commitSeconds = () => {
    const nextSeconds = Number(secondsDraft);
    if (!Number.isFinite(nextSeconds) || nextSeconds < 0) {
      setSecondsDraft(seconds.toFixed(1));
      return;
    }

    const nextTime = nextSeconds.toFixed(1);
    setSecondsDraft(nextTime);
    updateTimelineFrame(frame.id, { time: nextTime });
  };

  return (
    <aside className="right-inspector">
      <h2>キーフレーム編集</h2>
      <label>
        秒数
        <input
          type="number"
          value={secondsDraft}
          min={0}
          step={0.1}
          onChange={(event) => setSecondsDraft(event.target.value)}
          onBlur={commitSeconds}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
      <TextField label="表示名" value={frame.displayDate} onChange={(value) => updateTimelineFrame(frame.id, { displayDate: value })} />
      <button type="button" onClick={() => updateTimelineFrame(frame.id, { displayDate: formatTimelineLabel(frame.time) })}>
        秒数表示に戻す
      </button>
      <TextAreaField label="説明テキスト" value={frame.memo} onChange={(value) => updateTimelineFrame(frame.id, { memo: value })} />
    </aside>
  );
}
