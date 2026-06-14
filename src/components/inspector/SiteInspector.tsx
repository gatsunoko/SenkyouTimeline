import { useRef } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { defaultSiteIconUrl } from "../../data/defaultAssets";
import { useProjectStore } from "../../store/projectStore";
import { readFileAsDataUrl } from "../../utils/fileIO";
import { resolveSiteFrame } from "../../utils/interpolation";
import { compareTime } from "../../utils/time";
import { ColorField, NumberField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

export function SiteInspector({ id }: { id: string }) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const project = useProjectStore((state) => state.project);
  const updateSite = useProjectStore((state) => state.updateSite);
  const updateSiteKeyframe = useProjectStore((state) => state.updateSiteKeyframe);
  const deleteSiteKeyframe = useProjectStore((state) => state.deleteSiteKeyframe);
  const setSiteImage = useProjectStore((state) => state.setSiteImage);
  const clearSiteImage = useProjectStore((state) => state.clearSiteImage);
  const registerSiteAsset = useProjectStore((state) => state.registerSiteAsset);
  const site = project.sites.find((entry) => entry.id === id);
  if (!site) return null;

  const linkedAsset = project.siteAssets.find((asset) => asset.id === site.assetId);
  const siteFrame = resolveSiteFrame(site, project.timeline.currentTime);
  const keyframes = [...(site.keyframes ?? [])].sort((a, b) => compareTime(a.time, b.time));
  const displayIconUrl = site.iconUrl ?? defaultSiteIconUrl;

  const onImageFile = async (file?: File) => {
    if (!file) return;
    setSiteImage(site.id, await readFileAsDataUrl(file));
  };

  return (
    <aside className="right-inspector">
      <h2>拠点編集</h2>
      <TextField label="名前" value={site.name} onChange={(value) => updateSite(site.id, { name: value })} />
      <label>
        現在時間の陣営
        <select value={siteFrame.effectiveFactionId} onChange={(event) => updateSiteKeyframe(site.id, project.timeline.currentTime, { factionId: event.target.value })}>
          {project.factions.map((faction) => (
            <option value={faction.id} key={faction.id}>
              {faction.name}
            </option>
          ))}
        </select>
      </label>
      <NumberField label="サイズ" value={site.size ?? 1} min={0.3} max={4} step={0.05} onChange={(value) => updateSite(site.id, { size: value })} />
      <NumberField label="名前の文字サイズ" value={site.nameFontSize ?? 14 * (site.size ?? 1)} min={8} max={72} step={1} onChange={(value) => updateSite(site.id, { nameFontSize: value })} />
      <div className="coordinate-grid">
        <NumberField label="x" value={site.x} min={0} max={1} step={0.001} onChange={(value) => updateSite(site.id, { x: value })} />
        <NumberField label="y" value={site.y} min={0} max={1} step={0.001} onChange={(value) => updateSite(site.id, { y: value })} />
      </div>
      <h3>名前表示</h3>
      <ToggleField label="名前を表示" checked={site.showName !== false} onChange={(value) => updateSite(site.id, { showName: value })} />
      <ToggleField label="名前を太字" checked={site.nameBold ?? false} onChange={(value) => updateSite(site.id, { nameBold: value })} />
      <ColorField label="名前の文字色" value={site.nameTextColor ?? "#f5efe3"} onChange={(value) => updateSite(site.id, { nameTextColor: value })} />
      <ToggleField label="名前に背景" checked={site.nameBackgroundEnabled ?? false} onChange={(value) => updateSite(site.id, { nameBackgroundEnabled: value })} />
      {site.nameBackgroundEnabled && <ColorField label="名前背景色" value={site.nameBackgroundColor ?? "#111827"} onChange={(value) => updateSite(site.id, { nameBackgroundColor: value })} />}
      <ToggleField label="名前にアウトライン" checked={site.nameOutlineEnabled ?? false} onChange={(value) => updateSite(site.id, { nameOutlineEnabled: value })} />
      {site.nameOutlineEnabled && <ColorField label="名前アウトライン色" value={site.nameOutlineColor ?? "#111827"} onChange={(value) => updateSite(site.id, { nameOutlineColor: value })} />}

      <ToggleField label="ロック" checked={site.locked} onChange={(value) => updateSite(site.id, { locked: value })} />

      <h3>陣営キーフレーム</h3>
      <button type="button" onClick={() => updateSiteKeyframe(site.id, project.timeline.currentTime, { factionId: siteFrame.effectiveFactionId })}>
        現在時間に追加/更新
      </button>
      <div className="point-list">
        {keyframes.map((entry, index) => {
          const faction = project.factions.find((item) => item.id === entry.factionId);
          return (
            <div className="point-row keyframe-row" key={`${site.id}-faction-keyframe-${entry.time}-${index}`}>
              <span>{entry.displayDate || entry.time}</span>
              <small>{faction?.name ?? "陣営なし"}</small>
              <button type="button" className="icon-only danger" onClick={() => deleteSiteKeyframe(site.id, entry.time)}>
                削除
              </button>
            </div>
          );
        })}
      </div>

      <h3>画像拠点</h3>
      <div className="unit-image-preview">
        <img src={displayIconUrl} alt="" />
        <span>{site.iconUrl ? (linkedAsset ? `登録済み: ${linkedAsset.name}` : "未登録の画像") : "デフォルト画像"}</span>
      </div>
      <button type="button" onClick={() => imageInputRef.current?.click()}>
        <ImagePlus size={16} />
        画像をアップロード
      </button>
      {site.iconUrl && (
        <button type="button" className="danger" onClick={() => clearSiteImage(site.id)}>
          <Trash2 size={16} />
          画像を削除
        </button>
      )}
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
      {!site.assetId && (
        <button type="button" onClick={() => registerSiteAsset(site.id)}>
          アセットとして登録
        </button>
      )}
      {site.assetId && (
        <button type="button" onClick={() => registerSiteAsset(site.id)}>
          編集後を新規アセット登録
        </button>
      )}

      <TextAreaField label="メモ" value={site.memo} onChange={(value) => updateSite(site.id, { memo: value })} />
    </aside>
  );
}
