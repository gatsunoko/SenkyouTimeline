import { certaintyLabels, lineTypeLabels } from "../../data/pieceTemplates";
import { useProjectStore } from "../../store/projectStore";
import type { Certainty, LineType } from "../../types/project";
import { ColorField, NumberField, SelectField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

export function LineInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const updateLine = useProjectStore((state) => state.updateLine);
  const line = project.lines.find((entry) => entry.id === id);
  if (!line) return null;
  return (
    <aside className="right-inspector">
      <h2>線編集</h2>
      <TextField label="名前" value={line.name} onChange={(value) => updateLine(line.id, { name: value })} />
      <SelectField<LineType> label="種類" value={line.lineType} options={lineTypeLabels} onChange={(value) => updateLine(line.id, { lineType: value })} />
      <label>
        陣営
        <select value={line.factionId} onChange={(event) => updateLine(line.id, { factionId: event.target.value })}>
          {project.factions.map((faction) => <option value={faction.id} key={faction.id}>{faction.name}</option>)}
        </select>
      </label>
      <ColorField label="色" value={line.color} onChange={(value) => updateLine(line.id, { color: value })} />
      <NumberField label="太さ" value={line.width} min={1} max={20} onChange={(value) => updateLine(line.id, { width: value })} />
      <NumberField label="透明度" value={line.opacity} min={0.1} max={1} step={0.05} onChange={(value) => updateLine(line.id, { opacity: value })} />
      <ToggleField label="点線" checked={line.dashed} onChange={(value) => updateLine(line.id, { dashed: value })} />
      <SelectField<Certainty> label="確度" value={line.certainty} options={certaintyLabels} onChange={(value) => updateLine(line.id, { certainty: value })} />
      <TextAreaField label="メモ" value={line.memo} onChange={(value) => updateLine(line.id, { memo: value })} />
      <TextAreaField label="史料メモ" value={line.sourceNote} onChange={(value) => updateLine(line.id, { sourceNote: value })} />
    </aside>
  );
}
