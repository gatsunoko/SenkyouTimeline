import type { MapPoint } from "../../types/project";
import { useProjectStore } from "../../store/projectStore";
import { compareTime, sortedFrames } from "../../utils/time";
import { ColorField, NumberField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

function midpoint(a: MapPoint, b: MapPoint) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export function RegionInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const selectedRegionPointIndices = useProjectStore((state) => state.selectedRegionPointIndices);
  const updateRegion = useProjectStore((state) => state.updateRegion);
  const updateRegionPoints = useProjectStore((state) => state.updateRegionPoints);
  const clearRegionPointSelection = useProjectStore((state) => state.clearRegionPointSelection);
  const region = project.regions.find((entry) => entry.id === id);
  if (!region) return null;

  const frames = sortedFrames(project.timeline.frames);
  const displayStartTime = region.displayStartTime ?? frames[0]?.time ?? project.timeline.currentTime;
  const displayEndTime = region.displayEndTime ?? frames[frames.length - 1]?.time ?? project.timeline.end;
  const canDeletePoint = !region.locked && region.points.length > 3;
  const selectedPoints = selectedRegionPointIndices
    .filter((index) => index >= 0 && index < region.points.length)
    .sort((a, b) => a - b);
  const canInsertPoint = !region.locked && selectedPoints.length === 2;

  const insertPointBetweenSelection = () => {
    if (!canInsertPoint) return;
    const [firstIndex, secondIndex] = selectedPoints;
    const nextPoints = [...region.points];
    nextPoints.splice(secondIndex, 0, midpoint(region.points[firstIndex], region.points[secondIndex]));
    updateRegionPoints(region.id, nextPoints);
    clearRegionPointSelection();
  };

  const setDisplayStartTime = (value: string) => {
    updateRegion(region.id, {
      displayStartTime: value,
      displayEndTime: compareTime(value, displayEndTime) > 0 ? value : displayEndTime,
    });
  };

  const setDisplayEndTime = (value: string) => {
    updateRegion(region.id, {
      displayStartTime: compareTime(displayStartTime, value) > 0 ? value : displayStartTime,
      displayEndTime: value,
    });
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
      <NumberField label="表示順（大きいほど上）" value={region.displayOrder} step={1} onChange={(value) => updateRegion(region.id, { displayOrder: value })} />
      <ToggleField label="境界線を表示" checked={region.borderEnabled} onChange={(value) => updateRegion(region.id, { borderEnabled: value })} />
      {region.borderEnabled && (
        <>
          <ColorField label="境界線色" value={region.borderColor} onChange={(value) => updateRegion(region.id, { borderColor: value })} />
          <NumberField label="境界線幅" value={region.borderWidth} min={0} max={12} step={0.5} onChange={(value) => updateRegion(region.id, { borderWidth: value })} />
        </>
      )}
      <ToggleField label="名前を表示" checked={region.showName} onChange={(value) => updateRegion(region.id, { showName: value })} />
      <ToggleField label="ロック" checked={region.locked} onChange={(value) => updateRegion(region.id, { locked: value })} />

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

      <h3>点</h3>
      <button type="button" disabled={!canInsertPoint} onClick={insertPointBetweenSelection}>
        選択した点の間に点を追加
      </button>
      <div className="point-list">
        {region.points.map((point, index) => (
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
                updateRegionPoints(region.id, region.points.filter((_, pointIndex) => pointIndex !== index));
                clearRegionPointSelection();
              }}
            >
              削除
            </button>
          </div>
        ))}
      </div>

      <TextAreaField label="メモ" value={region.memo} onChange={(value) => updateRegion(region.id, { memo: value })} />
    </aside>
  );
}
