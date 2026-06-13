import { useEffect, useState } from "react";
import { useProjectStore } from "../../store/projectStore";
import { ArrowInspector } from "../inspector/ArrowInspector";
import { CameraInspector } from "../inspector/CameraInspector";
import { EventInspector } from "../inspector/EventInspector";
import { FrameInspector } from "../inspector/FrameInspector";
import { ImageInspector } from "../inspector/ImageInspector";
import { LabelInspector } from "../inspector/LabelInspector";
import { LineInspector } from "../inspector/LineInspector";
import { MapImageInspector } from "../inspector/MapImageInspector";
import { SiteInspector } from "../inspector/SiteInspector";
import { UnitInspector } from "../inspector/UnitInspector";

export function RightInspector() {
  const project = useProjectStore((state) => state.project);
  const selected = useProjectStore((state) => state.selected);
  const updateCameraLegend = useProjectStore((state) => state.updateCameraLegend);
  const updateFaction = useProjectStore((state) => state.updateFaction);
  const currentFactionLegendSize = Math.min(3, Math.max(0.5, project.cameraLegend?.factionSize ?? 1));
  const [legendSizeDraft, setLegendSizeDraft] = useState(String(currentFactionLegendSize));

  useEffect(() => {
    setLegendSizeDraft(String(currentFactionLegendSize));
  }, [currentFactionLegendSize, selected.type, selected.id]);

  const commitLegendSizeDraft = () => {
    const next = Number(legendSizeDraft);
    if (Number.isFinite(next)) updateCameraLegend({ factionSize: next });
    else setLegendSizeDraft(String(currentFactionLegendSize));
  };

  if (!selected.type || !selected.id) return null;

  if (selected.type === "factionSettings") {
    const cameraLegend = {
      showFactions: project.cameraLegend?.showFactions ?? true,
      factionSize: currentFactionLegendSize,
    };
    return (
      <aside className="right-inspector">
        <h2>陣営表示設定</h2>
        <label className="check-row">
          <input type="checkbox" checked={cameraLegend.showFactions} onChange={(event) => updateCameraLegend({ showFactions: event.target.checked })} />
          カメラに陣営情報を表示
        </label>
        <label>
          表示サイズ
          <div className="legend-size-control">
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.1}
              value={cameraLegend.factionSize}
              onChange={(event) => {
                setLegendSizeDraft(event.target.value);
                updateCameraLegend({ factionSize: Number(event.target.value) });
              }}
            />
            <input
              type="text"
              inputMode="decimal"
              value={legendSizeDraft}
              onChange={(event) => setLegendSizeDraft(event.target.value)}
              onBlur={commitLegendSizeDraft}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
          </div>
        </label>
        <h3>表示する陣営</h3>
        <div className="legend-faction-list">
          {project.factions.map((faction) => (
            <div className="legend-faction-row" key={faction.id}>
              <label className="check-row">
                <input type="checkbox" checked={faction.showInCameraLegend ?? false} onChange={(event) => updateFaction(faction.id, { showInCameraLegend: event.target.checked })} />
                <span className="color-swatch" style={{ backgroundColor: faction.color }} />
                {faction.name}
              </label>
              <input
                type="color"
                title="文字アウトライン色"
                value={faction.cameraLegendTextOutlineColor ?? "#111827"}
                onChange={(event) => updateFaction(faction.id, { cameraLegendTextOutlineColor: event.target.value })}
              />
            </div>
          ))}
        </div>
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
          名称
          <input value={faction.name} onChange={(event) => updateFaction(faction.id, { name: event.target.value })} />
        </label>
        <label>
          色
          <input type="color" value={faction.color} onChange={(event) => updateFaction(faction.id, { color: event.target.value })} />
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
  if (selected.type === "image") return <ImageInspector id={selected.id} />;
  if (selected.type === "line") return <LineInspector id={selected.id} />;
  if (selected.type === "arrow") return <ArrowInspector id={selected.id} />;
  if (selected.type === "event") return <EventInspector id={selected.id} />;
  if (selected.type === "label") return <LabelInspector id={selected.id} />;
  if (selected.type === "frame") return <FrameInspector id={selected.id} />;
  if (selected.type === "camera") return <CameraInspector />;
  if (selected.type === "mapImage") return <MapImageInspector />;

  return null;
}
