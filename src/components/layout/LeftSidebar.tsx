import { useState } from "react";
import { Castle, Eye, EyeOff, Flag, Lock, Plus, Shield, Unlock } from "lucide-react";
import { factionTypeLabels, siteTypeLabels, unitTypeLabels } from "../../data/pieceTemplates";
import { useProjectStore } from "../../store/projectStore";

type TabKey = "factions" | "units" | "sites";

export function LeftSidebar() {
  const [tab, setTab] = useState<TabKey>("factions");
  const project = useProjectStore((state) => state.project);
  const selected = useProjectStore((state) => state.selected);
  const addFaction = useProjectStore((state) => state.addFaction);
  const addUnit = useProjectStore((state) => state.addUnit);
  const addSite = useProjectStore((state) => state.addSite);
  const selectObject = useProjectStore((state) => state.selectObject);
  const updateFaction = useProjectStore((state) => state.updateFaction);
  const updateUnit = useProjectStore((state) => state.updateUnit);
  const updateSite = useProjectStore((state) => state.updateSite);

  return (
    <aside className="left-sidebar">
      <div className="tabs">
        <button className={tab === "factions" ? "is-active" : ""} onClick={() => setTab("factions")} type="button">
          陣営
        </button>
        <button className={tab === "units" ? "is-active" : ""} onClick={() => setTab("units")} type="button">
          軍勢
        </button>
        <button className={tab === "sites" ? "is-active" : ""} onClick={() => setTab("sites")} type="button">
          拠点
        </button>
      </div>

      {tab === "factions" && (
        <section className="sidebar-section">
          <button className="wide-action" type="button" onClick={addFaction}>
            <Plus size={16} /> 陣営追加
          </button>
          {project.factions.map((faction) => (
            <button
              className={`list-row ${selected.type === "faction" && selected.id === faction.id ? "is-selected" : ""}`}
              type="button"
              key={faction.id}
              onClick={() => selectObject("faction", faction.id)}
            >
              <span className="color-swatch" style={{ backgroundColor: faction.color }} />
              <span>
                <strong>{faction.name}</strong>
                <small>{factionTypeLabels[faction.type]}</small>
              </span>
              <input
                type="color"
                value={faction.color}
                onChange={(event) => updateFaction(faction.id, { color: event.target.value })}
                onClick={(event) => event.stopPropagation()}
                title="色変更"
              />
            </button>
          ))}
        </section>
      )}

      {tab === "units" && (
        <section className="sidebar-section">
          <button className="wide-action" type="button" onClick={() => addUnit()}>
            <Plus size={16} /> 軍勢追加
          </button>
          {project.units.map((unit) => {
            const faction = project.factions.find((entry) => entry.id === unit.factionId);
            return (
              <button
                className={`list-row ${selected.type === "unit" && selected.id === unit.id ? "is-selected" : ""}`}
                type="button"
                key={unit.id}
                onClick={() => selectObject("unit", unit.id)}
              >
                <Flag size={17} style={{ color: faction?.color }} />
                <span>
                  <strong>{unit.name}</strong>
                  <small>{unitTypeLabels[unit.unitType]} / {faction?.shortName ?? "陣営なし"}</small>
                </span>
                <button className="icon-only" type="button" onClick={(event) => { event.stopPropagation(); updateUnit(unit.id, { visible: !unit.visible }); }}>
                  {unit.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                </button>
                <button className="icon-only" type="button" onClick={(event) => { event.stopPropagation(); updateUnit(unit.id, { locked: !unit.locked }); }}>
                  {unit.locked ? <Lock size={15} /> : <Unlock size={15} />}
                </button>
              </button>
            );
          })}
        </section>
      )}

      {tab === "sites" && (
        <section className="sidebar-section">
          <button className="wide-action" type="button" onClick={() => addSite()}>
            <Plus size={16} /> 拠点追加
          </button>
          {project.sites.map((site) => (
            <button
              className={`list-row ${selected.type === "site" && selected.id === site.id ? "is-selected" : ""}`}
              type="button"
              key={site.id}
              onClick={() => selectObject("site", site.id)}
            >
              {site.siteType === "castle" ? <Castle size={17} /> : <Shield size={17} />}
              <span>
                <strong>{site.name}</strong>
                <small>{siteTypeLabels[site.siteType]}</small>
              </span>
              <button className="icon-only" type="button" onClick={(event) => { event.stopPropagation(); updateSite(site.id, { visible: !site.visible }); }}>
                {site.visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button className="icon-only" type="button" onClick={(event) => { event.stopPropagation(); updateSite(site.id, { locked: !site.locked }); }}>
                {site.locked ? <Lock size={15} /> : <Unlock size={15} />}
              </button>
            </button>
          ))}
        </section>
      )}
    </aside>
  );
}
