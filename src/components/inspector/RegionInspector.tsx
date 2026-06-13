import type { MapPoint } from "../../types/project";
import { useProjectStore } from "../../store/projectStore";
import { resolveRegionKeyframe } from "../../utils/interpolation";
import { compareTime, sortedFrames } from "../../utils/time";
import { DisplayPeriodFields } from "./DisplayPeriodFields";
import { ColorField, NumberField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

function midpoint(a: MapPoint, b: MapPoint) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function RegionInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const selectedRegionPointIndices = useProjectStore((state) => state.selectedRegionPointIndices);
  const updateRegion = useProjectStore((state) => state.updateRegion);
  const updateRegionPoints = useProjectStore((state) => state.updateRegionPoints);
  const deleteRegionKeyframe = useProjectStore((state) => state.deleteRegionKeyframe);
  const clearRegionPointSelection = useProjectStore((state) => state.clearRegionPointSelection);
  const region = project.regions.find((entry) => entry.id === id);
  if (!region) return null;

  const frame = resolveRegionKeyframe(region, project.timeline.currentTime, project.timeline.interpolationMode);
  const points = frame?.points ?? region.points;
  const keyframes = [...(region.keyframes ?? [])].sort((a, b) => compareTime(a.time, b.time));
  const frames = sortedFrames(project.timeline.frames);
  const displayStartTime = region.displayStartTime ?? keyframes[0]?.time ?? frames[0]?.time ?? project.timeline.currentTime;
  const displayEndTime = region.displayEndTime ?? project.timeline.end;
  const canDeletePoint = !region.locked && points.length > 3;
  const selectedPoints = selectedRegionPointIndices.filter((index) => index >= 0 && index < points.length).sort((a, b) => a - b);
  const canInsertPoint = !region.locked && selectedPoints.length === 2;

  const insertPointBetweenSelection = () => {
    if (!canInsertPoint) return;
    const [firstIndex, secondIndex] = selectedPoints;
    const nextPoints = [...points];
    nextPoints.splice(secondIndex, 0, midpoint(points[firstIndex], points[secondIndex]));
    updateRegionPoints(region.id, nextPoints);
    clearRegionPointSelection();
  };

  return (
    <aside className="right-inspector">
      <h2>領域編集</h2>
      <TextField label="名前" value={region.name} onChange={(value) => updateRegion(region.id, { name: value })} />
      <label>
        陣営
        <select value={region.factionId} onChange={(event) => updateRegion(region.id, { factionId: event.target.value })}>
          {project.factions.map((faction) => (
            <option value={faction.id} key={faction.id}>
              {faction.name}
            </option>
          ))}
        </select>
      </label>
      <ToggleField label="塗り色を陣営色に連動" checked={region.useFactionColor} onChange={(value) => updateRegion(region.id, { useFactionColor: value })} />
      {!region.useFactionColor && <ColorField label="塗り色" value={region.fillColor} onChange={(value) => updateRegion(region.id, { fillColor: value })} />}
      <NumberField label="透明度" value={region.opacity} min={0.05} max={1} step={0.05} onChange={(value) => updateRegion(region.id, { opacity: value })} />
      <NumberField label="表示順 大きいほど上" value={region.displayOrder} step={1} onChange={(value) => updateRegion(region.id, { displayOrder: value })} />
      <ToggleField label="境界線を表示" checked={region.borderEnabled} onChange={(value) => updateRegion(region.id, { borderEnabled: value })} />
      {region.borderEnabled && (
        <>
          <ColorField label="境界線色" value={region.borderColor} onChange={(value) => updateRegion(region.id, { borderColor: value })} />
          <NumberField label="境界線幅" value={region.borderWidth} min={0} max={12} step={0.5} onChange={(value) => updateRegion(region.id, { borderWidth: value })} />
        </>
      )}
      <ToggleField label="名前を表示" checked={region.showName} onChange={(value) => updateRegion(region.id, { showName: value })} />
      <ToggleField label="名前を太字" checked={region.nameBold ?? true} onChange={(value) => updateRegion(region.id, { nameBold: value })} />
      <ToggleField label="ロック" checked={region.locked} onChange={(value) => updateRegion(region.id, { locked: value })} />

      <h3>表示期間</h3>
      <DisplayPeriodFields
        startTime={region.displayStartTime}
        endTime={region.displayEndTime}
        fallbackStartTime={displayStartTime}
        fallbackEndTime={displayEndTime}
        onChange={(patch) => updateRegion(region.id, { displayStartTime: patch.startTime, displayEndTime: patch.endTime })}
      />

      <h3>点</h3>
      <button type="button" disabled={region.locked || points.length < 3} onClick={() => updateRegionPoints(region.id, points)}>
        現在の領域をキーフレームに追加
      </button>
      <button type="button" disabled={!canInsertPoint} onClick={insertPointBetweenSelection}>
        選択した点の間に点を追加
      </button>
      <div className="point-list">
        {points.map((point, index) => (
          <div className={`point-row ${selectedPoints.includes(index) ? "is-selected" : ""}`} key={`${region.id}-point-editor-${index}`}>
            <span>点 {index + 1}</span>
            <small>
              x {point.x.toFixed(3)} / y {point.y.toFixed(3)}
            </small>
            <button
              type="button"
              className="icon-only danger"
              disabled={!canDeletePoint}
              onClick={() => {
                updateRegionPoints(region.id, points.filter((_, pointIndex) => pointIndex !== index));
                clearRegionPointSelection();
              }}
            >
              削除
            </button>
          </div>
        ))}
      </div>

      <h3>この領域のキーフレーム</h3>
      <div className="point-list">
        {keyframes.map((entry, index) => (
          <div className="point-row keyframe-row" key={`${region.id}-keyframe-${entry.time}-${index}`}>
            <span>{entry.displayDate || entry.time}</span>
            <small>{entry.points.length} 点</small>
            <button type="button" className="icon-only danger" onClick={() => deleteRegionKeyframe(region.id, entry.time)}>
              削除
            </button>
          </div>
        ))}
      </div>

      <TextAreaField label="メモ" value={region.memo} onChange={(value) => updateRegion(region.id, { memo: value })} />
    </aside>
  );
}
