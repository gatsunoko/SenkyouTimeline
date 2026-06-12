import { useRef } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { useProjectStore } from "../../store/projectStore";
import { readFileAsDataUrl } from "../../utils/fileIO";
import { resolvePlacedImageFrame } from "../../utils/interpolation";
import { compareTime } from "../../utils/time";
import { NumberField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

function readImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("画像のサイズを取得できませんでした"));
    image.src = dataUrl;
  });
}

export function ImageInspector({ id }: { id: string }) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const project = useProjectStore((state) => state.project);
  const updateImage = useProjectStore((state) => state.updateImage);
  const registerImageAsset = useProjectStore((state) => state.registerImageAsset);
  const updateImageKeyframe = useProjectStore((state) => state.updateImageKeyframe);
  const deleteImageKeyframe = useProjectStore((state) => state.deleteImageKeyframe);
  const deleteSelected = useProjectStore((state) => state.deleteSelected);
  const imageObject = project.images.find((entry) => entry.id === id);
  if (!imageObject) return null;

  const frame = resolvePlacedImageFrame(imageObject, project.timeline.currentTime, project.timeline.interpolationMode);
  const keyframes = [...(imageObject.keyframes ?? [])].sort((a, b) => compareTime(a.time, b.time));
  const linkedAsset = project.imageAssets.find((asset) => asset.id === imageObject.assetId);

  const onImageFile = async (file?: File) => {
    if (!file) return;
    const imageDataUrl = await readFileAsDataUrl(file);
    const naturalSize = await readImageDimensions(imageDataUrl).catch(() => undefined);
    updateImage(imageObject.id, {
      imageDataUrl,
      naturalWidth: naturalSize?.width,
      naturalHeight: naturalSize?.height,
    });
  };

  return (
    <aside className="right-inspector">
      <h2>画像編集</h2>
      <TextField label="名前" value={imageObject.name} onChange={(value) => updateImage(imageObject.id, { name: value })} />
      <NumberField label="サイズ" value={imageObject.size ?? 1} min={0.1} max={8} step={0.05} onChange={(value) => updateImage(imageObject.id, { size: value })} />
      <div className="coordinate-grid">
        <NumberField label="x" value={frame.x} min={0} max={1} step={0.001} onChange={(value) => updateImageKeyframe(imageObject.id, project.timeline.currentTime, { x: value, y: frame.y })} />
        <NumberField label="y" value={frame.y} min={0} max={1} step={0.001} onChange={(value) => updateImageKeyframe(imageObject.id, project.timeline.currentTime, { x: frame.x, y: value })} />
      </div>
      <ToggleField label="ロック" checked={imageObject.locked} onChange={(value) => updateImage(imageObject.id, { locked: value })} />

      <div className="unit-image-preview">
        <img src={imageObject.imageDataUrl} alt="" />
        <span>{linkedAsset ? `登録済み: ${linkedAsset.name}` : "キャンバスには名前を表示しません。"}</span>
      </div>
      <button type="button" onClick={() => imageInputRef.current?.click()}>
        <ImagePlus size={16} />
        画像を差し替え
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
      {!imageObject.assetId && (
        <button type="button" onClick={() => registerImageAsset(imageObject.id)}>
          アセットとして登録
        </button>
      )}
      {imageObject.assetId && (
        <button type="button" onClick={() => registerImageAsset(imageObject.id)}>
          編集後を新規画像アセット登録
        </button>
      )}

      <h3>座標キーフレーム</h3>
      <button type="button" onClick={() => updateImageKeyframe(imageObject.id, project.timeline.currentTime, { x: frame.x, y: frame.y })}>
        現在の座標をキーに追加/更新
      </button>
      <div className="point-list">
        {keyframes.map((entry, index) => (
          <div className="point-row keyframe-row" key={`${imageObject.id}-image-keyframe-${entry.time}-${index}`}>
            <span>{entry.displayDate || entry.time}</span>
            <small>
              X {entry.x.toFixed(3)} / Y {entry.y.toFixed(3)}
            </small>
            <button type="button" className="icon-only danger" onClick={() => deleteImageKeyframe(imageObject.id, entry.time)} disabled={keyframes.length <= 1}>
              削除
            </button>
          </div>
        ))}
      </div>

      <TextAreaField label="メモ" value={imageObject.memo} onChange={(value) => updateImage(imageObject.id, { memo: value })} />
      <button type="button" className="danger" onClick={deleteSelected}>
        <Trash2 size={16} />
        画像オブジェクトを削除
      </button>
    </aside>
  );
}
