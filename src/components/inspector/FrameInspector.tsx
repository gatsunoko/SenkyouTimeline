import { useEffect, useState } from "react";
import { useProjectStore } from "../../store/projectStore";
import { formatTimelineLabel, parseTimelineSeconds } from "../../utils/time";
import { TextAreaField, TextField } from "./InspectorFields";

type KeyedObjectType = "unit" | "site" | "image" | "line" | "arrow" | "camera";

type KeyedObject = {
  id: string;
  type: KeyedObjectType;
  typeLabel: string;
  name: string;
  summary: string;
};

function sameTime(a?: string, b?: string) {
  if (!a || !b) return false;
  return Math.abs(parseTimelineSeconds(a) - parseTimelineSeconds(b)) < 0.05;
}

export function FrameInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const updateTimelineFrame = useProjectStore((state) => state.updateTimelineFrame);
  const selectObject = useProjectStore((state) => state.selectObject);
  const frame = project.timeline.frames.find((entry) => entry.id === id);
  const seconds = frame ? parseTimelineSeconds(frame.time) : 0;
  const [secondsDraft, setSecondsDraft] = useState(seconds.toFixed(1));

  useEffect(() => {
    setSecondsDraft(seconds.toFixed(1));
  }, [id, seconds]);

  if (!frame) return null;

  const keyedObjects: KeyedObject[] = [
    ...project.units.flatMap((unit) =>
      unit.keyframes.filter((keyframe) => sameTime(keyframe.time, frame.time)).map((keyframe) => ({
        id: unit.id,
        type: "unit" as const,
        typeLabel: "コマ",
        name: unit.name,
        summary: `X ${keyframe.x.toFixed(3)} / Y ${keyframe.y.toFixed(3)}`,
      })),
    ),
    ...project.sites.flatMap((site) =>
      (site.keyframes ?? []).filter((keyframe) => sameTime(keyframe.time, frame.time)).map((keyframe) => ({
        id: site.id,
        type: "site" as const,
        typeLabel: "城",
        name: site.name,
        summary: `陣営キー ${keyframe.factionId}`,
      })),
    ),
    ...project.images.flatMap((image) =>
      (image.keyframes ?? []).filter((keyframe) => sameTime(keyframe.time, frame.time)).map((keyframe) => ({
        id: image.id,
        type: "image" as const,
        typeLabel: "画像",
        name: image.name,
        summary: `X ${keyframe.x.toFixed(3)} / Y ${keyframe.y.toFixed(3)}`,
      })),
    ),
    ...project.lines.flatMap((line) =>
      line.keyframes.filter((keyframe) => sameTime(keyframe.time, frame.time)).map((keyframe) => ({
        id: line.id,
        type: "line" as const,
        typeLabel: "線",
        name: line.name,
        summary: `${keyframe.points.length} 点`,
      })),
    ),
    ...project.arrows.flatMap((arrow) =>
      (arrow.keyframes ?? []).filter((keyframe) => sameTime(keyframe.time, frame.time)).map((keyframe) => ({
        id: arrow.id,
        type: "arrow" as const,
        typeLabel: "矢印",
        name: arrow.name,
        summary: `${keyframe.points.length} 点`,
      })),
    ),
    ...((project.map.exportCamera?.keyframes ?? []).filter((keyframe) => sameTime(keyframe.time, frame.time)).map((keyframe) => ({
      id: "exportCamera",
      type: "camera" as const,
      typeLabel: "カメラ",
      name: "書き出しカメラ",
      summary: `X ${Math.round(keyframe.x)} / Y ${Math.round(keyframe.y)}`,
    })) satisfies KeyedObject[]),
  ];

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

      <h3>この時刻にキーがある対象</h3>
      {keyedObjects.length === 0 ? (
        <p className="inspector-note">この時刻にオブジェクトのキーはありません。</p>
      ) : (
        <div className="point-list">
          {keyedObjects.map((entry) => (
            <button className="point-row frame-key-target" type="button" key={`${entry.type}-${entry.id}`} onClick={() => selectObject(entry.type, entry.id)}>
              <span>{entry.typeLabel}</span>
              <strong>{entry.name}</strong>
              <small>{entry.summary}</small>
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
