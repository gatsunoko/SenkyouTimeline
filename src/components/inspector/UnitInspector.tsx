import { certaintyLabels, troopTypeLabels, unitStatusLabels, unitTypeLabels } from "../../data/pieceTemplates";
import { useProjectStore } from "../../store/projectStore";
import type { Certainty, TroopType, UnitStatus, UnitType } from "../../types/project";
import { getCurrentFrame } from "../../utils/time";
import { NumberField, SelectField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

export function UnitInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const updateUnit = useProjectStore((state) => state.updateUnit);
  const updateUnitKeyframe = useProjectStore((state) => state.updateUnitKeyframe);
  const deleteUnitKeyframe = useProjectStore((state) => state.deleteUnitKeyframe);
  const unit = project.units.find((entry) => entry.id === id);
  if (!unit) return null;
  const frame = getCurrentFrame(project.timeline.frames, project.timeline.currentTime);
  const keyframe = unit.keyframes.find((entry) => entry.time === project.timeline.currentTime);

  return (
    <aside className="right-inspector">
      <h2>軍勢編集</h2>
      <TextField label="名前" value={unit.name} onChange={(value) => updateUnit(unit.id, { name: value })} />
      <TextField label="短縮名" value={unit.shortName} onChange={(value) => updateUnit(unit.id, { shortName: value })} />
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
      <SelectField<UnitType> label="コマ種類" value={unit.unitType} options={unitTypeLabels} onChange={(value) => updateUnit(unit.id, { unitType: value })} />
      <TextField label="指揮官" value={unit.commander} onChange={(value) => updateUnit(unit.id, { commander: value })} />
      <SelectField<TroopType> label="兵種" value={unit.troopType} options={troopTypeLabels} onChange={(value) => updateUnit(unit.id, { troopType: value })} />
      <TextField label="兵数テキスト" value={unit.strengthText} onChange={(value) => updateUnit(unit.id, { strengthText: value })} />
      <SelectField<UnitStatus> label="状態" value={unit.status} options={unitStatusLabels} onChange={(value) => updateUnit(unit.id, { status: value })} />
      <SelectField<Certainty> label="確度" value={unit.certainty} options={certaintyLabels} onChange={(value) => updateUnit(unit.id, { certainty: value })} />
      <NumberField label="サイズ" value={unit.size} min={0.5} max={2} step={0.05} onChange={(value) => updateUnit(unit.id, { size: value })} />
      <ToggleField label="表示" checked={unit.visible} onChange={(value) => updateUnit(unit.id, { visible: value })} />
      <ToggleField label="ロック" checked={unit.locked} onChange={(value) => updateUnit(unit.id, { locked: value })} />
      <TextAreaField label="メモ" value={unit.memo} onChange={(value) => updateUnit(unit.id, { memo: value })} />
      <TextAreaField label="史料メモ" value={unit.sourceNote} onChange={(value) => updateUnit(unit.id, { sourceNote: value })} />

      <h3>現在日付のキーフレーム</h3>
      <div className="coordinate-grid">
        <NumberField label="x" value={keyframe?.x ?? 0.5} min={0} max={1} step={0.001} onChange={(value) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x: value, y: keyframe?.y ?? 0.5 })} />
        <NumberField label="y" value={keyframe?.y ?? 0.5} min={0} max={1} step={0.001} onChange={(value) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x: keyframe?.x ?? 0.5, y: value })} />
      </div>
      <button type="button" onClick={() => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x: keyframe?.x ?? 0.5, y: keyframe?.y ?? 0.5, visible: true, status: unit.status, displayDate: frame?.displayDate })}>
        現在日付にキーフレーム追加/更新
      </button>
      <button type="button" className="danger" onClick={() => deleteUnitKeyframe(unit.id, project.timeline.currentTime)}>
        現在日付のキーフレーム削除
      </button>
    </aside>
  );
}
