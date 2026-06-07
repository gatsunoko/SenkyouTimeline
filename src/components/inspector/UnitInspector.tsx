import { useRef } from "react";
import { ImagePlus } from "lucide-react";
import { useProjectStore } from "../../store/projectStore";
import type { Unit } from "../../types/project";
import { readFileAsDataUrl } from "../../utils/fileIO";
import { compareTime, getCurrentFrame, parseTimelineSeconds, sortedFrames } from "../../utils/time";
import { NumberField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

function firstUnitKeyframeTime(unit: Unit, fallback: string) {
  return [...unit.keyframes].sort((a, b) => compareTime(a.time, b.time))[0]?.time ?? fallback;
}

export function UnitInspector({ id }: { id: string }) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const project = useProjectStore((state) => state.project);
  const updateUnit = useProjectStore((state) => state.updateUnit);
  const setUnitImage = useProjectStore((state) => state.setUnitImage);
  const registerUnitAsset = useProjectStore((state) => state.registerUnitAsset);
  const duplicateUnitFromAsset = useProjectStore((state) => state.duplicateUnitFromAsset);
  const updateUnitKeyframe = useProjectStore((state) => state.updateUnitKeyframe);
  const deleteUnitKeyframe = useProjectStore((state) => state.deleteUnitKeyframe);
  const unit = project.units.find((entry) => entry.id === id);
  if (!unit) return null;

  const frame = getCurrentFrame(project.timeline.frames, project.timeline.currentTime);
  const currentSeconds = parseTimelineSeconds(project.timeline.currentTime);
  const keyframe = unit.keyframes.find((entry) => Math.abs(parseTimelineSeconds(entry.time) - currentSeconds) < 0.05);
  const frames = sortedFrames(project.timeline.frames);
  const unitKeyframes = [...unit.keyframes].sort((a, b) => compareTime(a.time, b.time));
  const fallbackStart = firstUnitKeyframeTime(unit, frames[0]?.time ?? project.timeline.currentTime);
  const displayStartTime = unit.displayStartTime ?? fallbackStart;
  const displayEndTime = unit.displayEndTime ?? frames[frames.length - 1]?.time ?? project.timeline.end;
  const linkedAsset = project.unitAssets.find((asset) => asset.id === unit.assetId);

  const setDisplayStartTime = (value: string) => {
    updateUnit(unit.id, {
      displayStartTime: value,
      displayEndTime: compareTime(value, displayEndTime) > 0 ? value : displayEndTime,
    });
  };

  const setDisplayEndTime = (value: string) => {
    updateUnit(unit.id, {
      displayStartTime: compareTime(displayStartTime, value) > 0 ? value : displayStartTime,
      displayEndTime: value,
    });
  };

  const onImageFile = async (file?: File) => {
    if (!file) return;
    const imageDataUrl = await readFileAsDataUrl(file);
    setUnitImage(unit.id, imageDataUrl);
  };

  return (
    <aside className="right-inspector">
      <h2>コマ編集</h2>
      <TextField label="名称" value={unit.name} onChange={(value) => updateUnit(unit.id, { name: value })} />
      <label>
        陣営
        <select value={unit.factionId} onChange={(event) => updateUnit(unit.id, { factionId: event.target.value })}>
          {project.factions.map((faction) => (
            <option value={faction.id} key={faction.id}>
              {faction.name}
            </option>
          ))}
        </select>
      </label>
      <NumberField label="サイズ" value={unit.size} min={0.5} max={2} step={0.05} onChange={(value) => updateUnit(unit.id, { size: value })} />
      <ToggleField label="表示" checked={unit.visible} onChange={(value) => updateUnit(unit.id, { visible: value })} />
      <ToggleField label="ロック" checked={unit.locked} onChange={(value) => updateUnit(unit.id, { locked: value })} />

      <h3>画像コマ</h3>
      {unit.iconUrl && (
        <div className="unit-image-preview">
          <img src={unit.iconUrl} alt="" />
          <span>{linkedAsset ? `登録済み: ${linkedAsset.name}` : "未登録の画像"}</span>
        </div>
      )}
      <button type="button" onClick={() => imageInputRef.current?.click()}>
        <ImagePlus size={16} />
        画像をアップロード
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void onImageFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      {unit.iconUrl && <ToggleField label="名称を表示" checked={unit.showName !== false} onChange={(value) => updateUnit(unit.id, { showName: value })} />}
      {unit.iconUrl && !unit.assetId && (
        <button type="button" onClick={() => registerUnitAsset(unit.id)}>
          アセットとして登録
        </button>
      )}
      {unit.assetId && (
        <button type="button" onClick={() => duplicateUnitFromAsset(unit.assetId!)}>
          この画像コマを複製
        </button>
      )}

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

      <TextAreaField label="メモ" value={unit.memo} onChange={(value) => updateUnit(unit.id, { memo: value })} />

      <h3>現在時間のキーフレーム</h3>
      <div className="coordinate-grid">
        <NumberField label="x" value={keyframe?.x ?? 0.5} min={0} max={1} step={0.001} onChange={(value) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x: value, y: keyframe?.y ?? 0.5 })} />
        <NumberField label="y" value={keyframe?.y ?? 0.5} min={0} max={1} step={0.001} onChange={(value) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x: keyframe?.x ?? 0.5, y: value })} />
      </div>
      <button type="button" onClick={() => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x: keyframe?.x ?? 0.5, y: keyframe?.y ?? 0.5, visible: true, status: unit.status, displayDate: frame?.displayDate })}>
        現在時間にキーフレーム追加/更新
      </button>
      <button type="button" className="danger" onClick={() => deleteUnitKeyframe(unit.id, project.timeline.currentTime)}>
        現在時間のキーフレーム削除
      </button>

      <h3>このコマのキーフレーム</h3>
      <div className="point-list">
        {unitKeyframes.map((entry, index) => (
          <div className="point-row keyframe-row" key={`${unit.id}-keyframe-${entry.time}-${index}`}>
            <span>{entry.displayDate || entry.time}</span>
            <small>
              x {entry.x.toFixed(3)} / y {entry.y.toFixed(3)}
            </small>
            <button
              type="button"
              className="icon-only danger"
              onClick={() => deleteUnitKeyframe(unit.id, entry.time)}
            >
              削除
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
