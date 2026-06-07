import { certaintyLabels, siteStatusLabels, siteTypeLabels } from "../../data/pieceTemplates";
import { useProjectStore } from "../../store/projectStore";
import type { Certainty, SiteStatus, SiteType } from "../../types/project";
import { NumberField, SelectField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

export function SiteInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const updateSite = useProjectStore((state) => state.updateSite);
  const site = project.sites.find((entry) => entry.id === id);
  if (!site) return null;
  return (
    <aside className="right-inspector">
      <h2>拠点編集</h2>
      <TextField label="名前" value={site.name} onChange={(value) => updateSite(site.id, { name: value })} />
      <SelectField<SiteType> label="拠点種類" value={site.siteType} options={siteTypeLabels} onChange={(value) => updateSite(site.id, { siteType: value })} />
      <label>
        陣営
        <select value={site.factionId} onChange={(event) => updateSite(site.id, { factionId: event.target.value })}>
          {project.factions.map((faction) => (
            <option value={faction.id} key={faction.id}>{faction.name}</option>
          ))}
        </select>
      </label>
      <SelectField<SiteStatus> label="状態" value={site.status} options={siteStatusLabels} onChange={(value) => updateSite(site.id, { status: value })} />
      <SelectField<Certainty> label="確度" value={site.certainty} options={certaintyLabels} onChange={(value) => updateSite(site.id, { certainty: value })} />
      <div className="coordinate-grid">
        <NumberField label="x" value={site.x} min={0} max={1} step={0.001} onChange={(value) => updateSite(site.id, { x: value })} />
        <NumberField label="y" value={site.y} min={0} max={1} step={0.001} onChange={(value) => updateSite(site.id, { y: value })} />
      </div>
      <ToggleField label="表示" checked={site.visible} onChange={(value) => updateSite(site.id, { visible: value })} />
      <ToggleField label="ロック" checked={site.locked} onChange={(value) => updateSite(site.id, { locked: value })} />
      <TextAreaField label="メモ" value={site.memo} onChange={(value) => updateSite(site.id, { memo: value })} />
      <TextAreaField label="史料メモ" value={site.sourceNote} onChange={(value) => updateSite(site.id, { sourceNote: value })} />
    </aside>
  );
}
