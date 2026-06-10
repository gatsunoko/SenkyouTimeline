import { useEffect, useRef, useState } from "react";
import { Castle, Copy, Flag, Lock, Paintbrush, PanelLeftClose, Plus, Trash2, Unlock } from "lucide-react";
import { factionTypeLabels } from "../../data/pieceTemplates";
import { useProjectStore } from "../../store/projectStore";
import { resolveSiteFrame } from "../../utils/interpolation";

type TabKey = "factions" | "units" | "sites";
type UnitSidebarView = "units" | "assets";
type SiteSidebarView = "sites" | "assets";

export function LeftSidebar({ onCollapse }: { onCollapse: () => void }) {
  const [tab, setTab] = useState<TabKey>("factions");
  const [unitView, setUnitView] = useState<UnitSidebarView>("units");
  const [siteView, setSiteView] = useState<SiteSidebarView>("sites");
  const unitRowRefs = useRef(new Map<string, HTMLButtonElement>());
  const siteRowRefs = useRef(new Map<string, HTMLButtonElement>());
  const project = useProjectStore((state) => state.project);
  const selected = useProjectStore((state) => state.selected);
  const unitPlacementAssetId = useProjectStore((state) => state.unitPlacementAssetId);
  const sitePlacementAssetId = useProjectStore((state) => state.sitePlacementAssetId);
  const addFaction = useProjectStore((state) => state.addFaction);
  const deleteFaction = useProjectStore((state) => state.deleteFaction);
  const setUnitPlacementAsset = useProjectStore((state) => state.setUnitPlacementAsset);
  const deleteUnitAsset = useProjectStore((state) => state.deleteUnitAsset);
  const setSitePlacementAsset = useProjectStore((state) => state.setSitePlacementAsset);
  const deleteSiteAsset = useProjectStore((state) => state.deleteSiteAsset);
  const selectObject = useProjectStore((state) => state.selectObject);
  const updateFaction = useProjectStore((state) => state.updateFaction);
  const updateUnit = useProjectStore((state) => state.updateUnit);
  const updateSite = useProjectStore((state) => state.updateSite);

  useEffect(() => {
    if (!selected.id) return;
    if (selected.type === "unit") {
      setTab("units");
      setUnitView("units");
      return;
    }
    if (selected.type === "site") {
      setTab("sites");
      setSiteView("sites");
    }
  }, [selected.id, selected.type]);

  useEffect(() => {
    if (selected.type !== "unit" || !selected.id || tab !== "units" || unitView !== "units") return;
    window.requestAnimationFrame(() => {
      unitRowRefs.current.get(selected.id!)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [selected.id, selected.type, tab, unitView, project.units.length]);

  useEffect(() => {
    if (selected.type !== "site" || !selected.id || tab !== "sites" || siteView !== "sites") return;
    window.requestAnimationFrame(() => {
      siteRowRefs.current.get(selected.id!)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [selected.id, selected.type, tab, siteView, project.sites.length]);

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
            <div
              className={`list-row faction-row asset-row-clickable ${selected.type === "faction" && selected.id === faction.id ? "is-selected" : ""}`}
              role="button"
              tabIndex={0}
              key={faction.id}
              onClick={() => selectObject("faction", faction.id)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectObject("faction", faction.id);
                }
              }}
            >
              <span className="color-swatch" style={{ backgroundColor: faction.color }} />
              <span>
                <strong>{faction.name}</strong>
                <small>{factionTypeLabels[faction.type]}</small>
              </span>
              <label className="color-edit-button" title="陣営色を変更" onClick={(event) => event.stopPropagation()}>
                <Paintbrush size={14} />
                <span className="color-edit-swatch" style={{ backgroundColor: faction.color }} />
                <input
                  type="color"
                  value={faction.color}
                  onChange={(event) => updateFaction(faction.id, { color: event.target.value })}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`${faction.name}の色を変更`}
                />
              </label>
              <button
                className="icon-only danger"
                type="button"
                title={project.factions.length <= 1 ? "最後の陣営は削除できません" : "陣営を削除"}
                disabled={project.factions.length <= 1}
                onClick={(event) => {
                  event.stopPropagation();
                  deleteFaction(faction.id);
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </section>
      )}

      {tab === "units" && (
        <section className="sidebar-section">
          <button className={`wide-action ${unitView === "assets" ? "is-active" : ""}`} type="button" onClick={() => setUnitView((view) => (view === "assets" ? "units" : "assets"))}>
            {unitView === "assets" ? <Flag size={16} /> : <Copy size={16} />}
            {unitView === "assets" ? "コマ一覧へ戻る" : "アセット"}
          </button>
          {unitView === "units" && (
            <>
              {project.units.map((unit) => {
                const faction = project.factions.find((entry) => entry.id === unit.factionId);
                return (
                  <button
                    className={`list-row ${selected.type === "unit" && selected.id === unit.id ? "is-selected" : ""}`}
                    type="button"
                    key={unit.id}
                    ref={(node) => {
                      if (node) unitRowRefs.current.set(unit.id, node);
                      else unitRowRefs.current.delete(unit.id);
                    }}
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
            </>
          )}

          {unitView === "assets" && (
            <>
              {project.unitAssets.length === 0 && <div className="sidebar-empty">登録済みのコマアセットはありません。</div>}
              {project.unitAssets.map((asset) => {
                const faction = project.factions.find((entry) => entry.id === asset.factionId);
                const assetName = asset.name.trim() || "（名前なし）";
                return (
                  <div
                    className={`list-row asset-row asset-row-clickable ${unitPlacementAssetId === asset.id ? "is-selected" : ""}`}
                    role="button"
                    tabIndex={0}
                    key={asset.id}
                    onClick={() => setUnitPlacementAsset(asset.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setUnitPlacementAsset(asset.id);
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
                      <small>クリックで配置準備</small>
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
          <button className={`wide-action ${siteView === "assets" ? "is-active" : ""}`} type="button" onClick={() => setSiteView((view) => (view === "assets" ? "sites" : "assets"))}>
            {siteView === "assets" ? <Castle size={16} /> : <Copy size={16} />}
            {siteView === "assets" ? "拠点一覧へ戻る" : "アセット"}
          </button>

          {siteView === "sites" && (
            <>
              {project.sites.map((site) => (
                (() => {
                  const siteFrame = resolveSiteFrame(site, project.timeline.currentTime);
                  const faction = project.factions.find((entry) => entry.id === siteFrame.effectiveFactionId);
                  const factionColor = faction?.color ?? "#8a96a8";
                  return (
                    <button
                      className={`list-row ${selected.type === "site" && selected.id === site.id ? "is-selected" : ""}`}
                      type="button"
                      key={site.id}
                      ref={(node) => {
                        if (node) siteRowRefs.current.set(site.id, node);
                        else siteRowRefs.current.delete(site.id);
                      }}
                      onClick={() => selectObject("site", site.id)}
                    >
                      <span className="site-list-icon" style={{ backgroundColor: factionColor }}>
                        {site.iconUrl ? <img src={site.iconUrl} alt="" /> : <Castle size={16} />}
                      </span>
                      <span>
                        <strong>{site.name}</strong>
                        <small>{faction?.name ?? "陣営なし"}</small>
                      </span>
                      <button className="icon-only" type="button" onClick={(event) => { event.stopPropagation(); updateSite(site.id, { locked: !site.locked }); }}>
                        {site.locked ? <Lock size={15} /> : <Unlock size={15} />}
                      </button>
                    </button>
                  );
                })()
              ))}
            </>
          )}

          {siteView === "assets" && (
            <>
              {project.siteAssets.length === 0 && <div className="sidebar-empty">登録済みの拠点アセットはありません。</div>}
              {project.siteAssets.map((asset) => {
                const assetName = asset.name.trim() || "（名前なし）";
                const faction = project.factions.find((entry) => entry.id === asset.factionId);
                const factionColor = faction?.color ?? "#8a96a8";
                return (
                  <div
                    className={`list-row asset-row asset-row-clickable ${sitePlacementAssetId === asset.id ? "is-selected" : ""}`}
                    role="button"
                    tabIndex={0}
                    key={asset.id}
                    onClick={() => setSitePlacementAsset(asset.id)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSitePlacementAsset(asset.id);
                      }
                    }}
                  >
                    <span className="site-list-icon" style={{ backgroundColor: factionColor }}>
                      <img src={asset.imageDataUrl} alt="" />
                    </span>
                    <span>
                      <strong>{assetName}</strong>
                      <small>{faction?.name ?? "陣営なし"} / クリックで配置準備</small>
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
