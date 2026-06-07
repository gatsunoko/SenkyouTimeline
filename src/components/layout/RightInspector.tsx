import { useProjectStore } from "../../store/projectStore";
import { ArrowInspector } from "../inspector/ArrowInspector";
import { EventInspector } from "../inspector/EventInspector";
import { LabelInspector } from "../inspector/LabelInspector";
import { LineInspector } from "../inspector/LineInspector";
import { SiteInspector } from "../inspector/SiteInspector";
import { UnitInspector } from "../inspector/UnitInspector";
import { factionTypeLabels } from "../../data/pieceTemplates";

export function RightInspector() {
  const project = useProjectStore((state) => state.project);
  const selected = useProjectStore((state) => state.selected);
  const updateFaction = useProjectStore((state) => state.updateFaction);

  if (!selected.type || !selected.id) {
    return (
      <aside className="right-inspector">
        <h2>インスペクター</h2>
        <p className="empty-message">キャンバスまたは一覧から編集対象を選択してください。</p>
      </aside>
    );
  }

  if (selected.type === "faction") {
    const faction = project.factions.find((entry) => entry.id === selected.id);
    if (!faction) return null;
    return (
      <aside className="right-inspector">
        <h2>陣営編集</h2>
        <label>
          名前
          <input value={faction.name} onChange={(event) => updateFaction(faction.id, { name: event.target.value })} />
        </label>
        <label>
          短縮名
          <input value={faction.shortName} onChange={(event) => updateFaction(faction.id, { shortName: event.target.value })} />
        </label>
        <label>
          色
          <input type="color" value={faction.color} onChange={(event) => updateFaction(faction.id, { color: event.target.value })} />
        </label>
        <label>
          種類
          <select value={faction.type} onChange={(event) => updateFaction(faction.id, { type: event.target.value as typeof faction.type })}>
            {Object.entries(factionTypeLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          メモ
          <textarea value={faction.memo} onChange={(event) => updateFaction(faction.id, { memo: event.target.value })} />
        </label>
      </aside>
    );
  }

  if (selected.type === "unit") return <UnitInspector id={selected.id} />;
  if (selected.type === "site") return <SiteInspector id={selected.id} />;
  if (selected.type === "line") return <LineInspector id={selected.id} />;
  if (selected.type === "arrow") return <ArrowInspector id={selected.id} />;
  if (selected.type === "event") return <EventInspector id={selected.id} />;
  if (selected.type === "label") return <LabelInspector id={selected.id} />;

  return null;
}
