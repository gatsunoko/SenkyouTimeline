import { arrowTypeLabels, certaintyLabels } from "../../data/pieceTemplates";
import { useProjectStore } from "../../store/projectStore";
import type { ArrowType, Certainty } from "../../types/project";
import { ColorField, NumberField, SelectField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

export function ArrowInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const updateArrow = useProjectStore((state) => state.updateArrow);
  const arrow = project.arrows.find((entry) => entry.id === id);
  if (!arrow) return null;
  return (
    <aside className="right-inspector">
      <h2>矢印編集</h2>
      <TextField label="名前" value={arrow.name} onChange={(value) => updateArrow(arrow.id, { name: value })} />
      <SelectField<ArrowType> label="種類" value={arrow.arrowType} options={arrowTypeLabels} onChange={(value) => updateArrow(arrow.id, { arrowType: value })} />
      <label>
        陣営
        <select value={arrow.factionId} onChange={(event) => updateArrow(arrow.id, { factionId: event.target.value })}>
          {project.factions.map((faction) => <option value={faction.id} key={faction.id}>{faction.name}</option>)}
        </select>
      </label>
      <ColorField label="色" value={arrow.color} onChange={(value) => updateArrow(arrow.id, { color: value })} />
      <NumberField label="太さ" value={arrow.width} min={1} max={20} onChange={(value) => updateArrow(arrow.id, { width: value })} />
      <NumberField label="透明度" value={arrow.opacity} min={0.1} max={1} step={0.05} onChange={(value) => updateArrow(arrow.id, { opacity: value })} />
      <ToggleField label="点線" checked={arrow.dashed} onChange={(value) => updateArrow(arrow.id, { dashed: value })} />
      <SelectField<Certainty> label="確度" value={arrow.certainty} options={certaintyLabels} onChange={(value) => updateArrow(arrow.id, { certainty: value })} />
      <TextAreaField label="メモ" value={arrow.memo} onChange={(value) => updateArrow(arrow.id, { memo: value })} />
      <TextAreaField label="史料メモ" value={arrow.sourceNote} onChange={(value) => updateArrow(arrow.id, { sourceNote: value })} />
    </aside>
  );
}
