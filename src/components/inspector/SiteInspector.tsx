import { useRef } from "react";
import { ImagePlus } from "lucide-react";
import { siteStatusLabels, siteTypeLabels } from "../../data/pieceTemplates";
import { useProjectStore } from "../../store/projectStore";
import type { SiteStatus, SiteType } from "../../types/project";
import { readFileAsDataUrl } from "../../utils/fileIO";
import { NumberField, SelectField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

export function SiteInspector({ id }: { id: string }) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const project = useProjectStore((state) => state.project);
  const updateSite = useProjectStore((state) => state.updateSite);
  const setSiteImage = useProjectStore((state) => state.setSiteImage);
  const registerSiteAsset = useProjectStore((state) => state.registerSiteAsset);
  const duplicateSiteFromAsset = useProjectStore((state) => state.duplicateSiteFromAsset);
  const site = project.sites.find((entry) => entry.id === id);
  if (!site) return null;

  const linkedAsset = project.siteAssets.find((asset) => asset.id === site.assetId);

  const onImageFile = async (file?: File) => {
    if (!file) return;
    setSiteImage(site.id, await readFileAsDataUrl(file));
  };

  return (
    <aside className="right-inspector">
      <h2>拠点編集</h2>
      <TextField label="名称" value={site.name} onChange={(value) => updateSite(site.id, { name: value })} />
      <SelectField<SiteType> label="拠点種類" value={site.siteType} options={siteTypeLabels} onChange={(value) => updateSite(site.id, { siteType: value })} />
      <label>
        陣営
        <select value={site.factionId} onChange={(event) => updateSite(site.id, { factionId: event.target.value })}>
          {project.factions.map((faction) => (
            <option value={faction.id} key={faction.id}>
              {faction.name}
            </option>
          ))}
        </select>
      </label>
      <SelectField<SiteStatus> label="状態" value={site.status} options={siteStatusLabels} onChange={(value) => updateSite(site.id, { status: value })} />
      <NumberField label="サイズ" value={site.size ?? 1} min={0.3} max={4} step={0.05} onChange={(value) => updateSite(site.id, { size: value })} />
      <div className="coordinate-grid">
        <NumberField label="x" value={site.x} min={0} max={1} step={0.001} onChange={(value) => updateSite(site.id, { x: value })} />
        <NumberField label="y" value={site.y} min={0} max={1} step={0.001} onChange={(value) => updateSite(site.id, { y: value })} />
      </div>
      <ToggleField label="表示" checked={site.visible} onChange={(value) => updateSite(site.id, { visible: value })} />
      <ToggleField label="ロック" checked={site.locked} onChange={(value) => updateSite(site.id, { locked: value })} />

      <h3>画像拠点</h3>
      {site.iconUrl && (
        <div className="unit-image-preview">
          <img src={site.iconUrl} alt="" />
          <span>{linkedAsset ? `登録済み: ${linkedAsset.name}` : "未登録の画像"}</span>
        </div>
      )}
      <button type="button" onClick={() => imageInputRef.current?.click()}>
        <ImagePlus size={16} />
        画像をアップロード
      </button>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          void onImageFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      {site.iconUrl && <ToggleField label="名称を表示" checked={site.showName !== false} onChange={(value) => updateSite(site.id, { showName: value })} />}
      {site.iconUrl && !site.assetId && (
        <button type="button" onClick={() => registerSiteAsset(site.id)}>
          アセットとして登録
        </button>
      )}
      {site.assetId && (
        <button type="button" onClick={() => duplicateSiteFromAsset(site.assetId!)}>
          この画像拠点を複製
        </button>
      )}

      <TextAreaField label="メモ" value={site.memo} onChange={(value) => updateSite(site.id, { memo: value })} />
    </aside>
  );
}
