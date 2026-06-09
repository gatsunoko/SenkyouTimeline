import { useState } from "react";
import { Castle, Copy, Flag, Lock, PanelLeftClose, Plus, Trash2, Unlock } from "lucide-react";
import { factionTypeLabels } from "../../data/pieceTemplates";
import { useProjectStore } from "../../store/projectStore";

type TabKey = "factions" | "units" | "sites";

export function LeftSidebar({ onCollapse }: { onCollapse: () => void }) {
  const [tab, setTab] = useState<TabKey>("factions");
  const project = useProjectStore((state) => state.project);
  const selected = useProjectStore((state) => state.selected);
  const addFaction = useProjectStore((state) => state.addFaction);
  const addUnit = useProjectStore((state) => state.addUnit);
  const duplicateUnitFromAsset = useProjectStore((state) => state.duplicateUnitFromAsset);
  const deleteUnitAsset = useProjectStore((state) => state.deleteUnitAsset);
  const addSite = useProjectStore((state) => state.addSite);
  const duplicateSiteFromAsset = useProjectStore((state) => state.duplicateSiteFromAsset);
  const deleteSiteAsset = useProjectStore((state) => state.deleteSiteAsset);
  const selectObject = useProjectStore((state) => state.selectObject);
  const updateFaction = useProjectStore((state) => state.updateFaction);
  const updateUnit = useProjectStore((state) => state.updateUnit);
  const updateSite = useProjectStore((state) => state.updateSite);

  return (
    <aside className="left-sidebar">
      <div className="sidebar-header">
        <strong>一覧</strong>
        <button className="icon-only" type="button" onClick={onCollapse} title="サイドバーをしまう">
          <PanelLeftClose size={17} />
        </button>
      </div>
      <div className="tabs">
        <button className={tab === "factions" ? "is-active" : ""} onClick={() => setTab("factions")} type="button">
          陣営
        </button>
        <button className={tab === "units" ? "is-active" : ""} onClick={() => setTab("units")} type="button">
          コマ
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
            <Plus size={16} /> コマ追加
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
                {unit.iconUrl ? <img className="asset-thumb" src={unit.iconUrl} alt="" /> : <Flag size={17} style={{ color: faction?.color }} />}
                <span>
                  <strong>{unit.name}</strong>
                  <small>{faction?.name ?? "陣営なし"}</small>
                </span>
                <button className="icon-only" type="button" onClick={(event) => { event.stopPropagation(); updateUnit(unit.id, { locked: !unit.locked }); }}>
                  {unit.locked ? <Lock size={15} /> : <Unlock size={15} />}
                </button>
              </button>
            );
          })}

          {project.unitAssets.length > 0 && (
            <>
              <div className="sidebar-subheading">登録アセット</div>
              {project.unitAssets.map((asset) => {
                const faction = project.factions.find((entry) => entry.id === asset.factionId);
                const assetName = asset.name.trim() || "（名前なし）";
                return (
                  <div
                    className="list-row asset-row asset-row-clickable"
                    role="button"
                    tabIndex={0}
                    key={asset.id}
                    onClick={() => duplicateUnitFromAsset(asset.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        duplicateUnitFromAsset(asset.id);
                      }
                    }}
                  >
                    {asset.imageDataUrl ? (
                      <img className="asset-thumb" src={asset.imageDataUrl} alt="" />
                    ) : (
                      <span className="asset-thumb asset-thumb-fallback" style={{ backgroundColor: faction?.color ?? "#0c121b" }}>
                        <Flag size={15} />
                      </span>
                    )}
                    <span>
                      <strong>{assetName}</strong>
                      <small>クリックで複製</small>
                    </span>
                    <Copy size={16} />
                    <button
                      className="icon-only danger"
                      type="button"
                      title="アセットを削除"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteUnitAsset(asset.id);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </>
          )}
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
              {site.iconUrl ? <img className="asset-thumb" src={site.iconUrl} alt="" /> : <Castle size={17} />}
              <span>
                <strong>{site.name}</strong>
                <small>拠点</small>
              </span>
              <button className="icon-only" type="button" onClick={(event) => { event.stopPropagation(); updateSite(site.id, { locked: !site.locked }); }}>
                {site.locked ? <Lock size={15} /> : <Unlock size={15} />}
              </button>
            </button>
          ))}
          {project.siteAssets.length > 0 && (
            <>
              <div className="sidebar-subheading">登録アセット</div>
              {project.siteAssets.map((asset) => {
                const assetName = asset.name.trim() || "（名前なし）";
                return (
                  <div
                    className="list-row asset-row asset-row-clickable"
                    role="button"
                    tabIndex={0}
                    key={asset.id}
                    onClick={() => duplicateSiteFromAsset(asset.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        duplicateSiteFromAsset(asset.id);
                      }
                    }}
                  >
                    <img className="asset-thumb" src={asset.imageDataUrl} alt="" />
                    <span>
                      <strong>{assetName}</strong>
                      <small>クリックで複製</small>
                    </span>
                    <Copy size={16} />
                    <button
                      className="icon-only danger"
                      type="button"
                      title="アセットを削除"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteSiteAsset(asset.id);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </section>
      )}
    </aside>
  );
}
