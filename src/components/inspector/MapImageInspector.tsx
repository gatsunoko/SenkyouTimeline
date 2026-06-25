import { useProjectStore } from "../../store/projectStore";
import { NumberField, TextField } from "./InspectorFields";

export function MapImageInspector() {
  const project = useProjectStore((state) => state.project);
  const selected = useProjectStore((state) => state.selected);
  const selectObject = useProjectStore((state) => state.selectObject);
  const setTool = useProjectStore((state) => state.setTool);
  const updateMapImagePlacement = useProjectStore((state) => state.updateMapImagePlacement);
  const moveMapImageOrder = useProjectStore((state) => state.moveMapImageOrder);
  const deleteMapImage = useProjectStore((state) => state.deleteMapImage);
  const images = project.map.images ?? [];
  const orderedImages = [...images].reverse();
  const selectedImage = orderedImages.find((image) => image.id === selected.id) ?? orderedImages[0];
  const selectedIndex = selectedImage ? images.findIndex((image) => image.id === selectedImage.id) : -1;
  const selectedDisplayIndex = selectedImage ? orderedImages.findIndex((image) => image.id === selectedImage.id) : -1;

  const selectMapImage = (id: string) => {
    setTool("mapImageEdit");
    selectObject("mapImage", id);
  };

  const removeSelectedImage = () => {
    if (!selectedImage) return;
    const nextImage = orderedImages[selectedDisplayIndex + 1] ?? orderedImages[selectedDisplayIndex - 1] ?? null;
    deleteMapImage(selectedImage.id);
    if (nextImage) selectMapImage(nextImage.id);
    else selectObject(null, null);
  };

  return (
    <aside className="right-inspector">
      <h2>地図画像編集</h2>
      {images.length === 0 ? (
        <p className="inspector-note">地図画像が読み込まれていません。</p>
      ) : (
        <>
          <div className="point-list">
            {orderedImages.map((image) => {
              const index = images.findIndex((entry) => entry.id === image.id);
              return (
              <div className={`point-row map-image-row ${selectedImage?.id === image.id ? "is-selected" : ""}`} key={image.id} onClick={() => selectMapImage(image.id)}>
                <span>{image.name || `地図画像${index + 1}`}</span>
                <small>
                  表示順 {index + 1} / 透明度 {Math.round((image.opacity ?? 1) * 100)}%
                </small>
              </div>
              );
            })}
          </div>

          {selectedImage && (
            <>
              <TextField label="名前" value={selectedImage.name} onChange={(value) => updateMapImagePlacement(selectedImage.id, { name: value })} />
              <NumberField label="X" value={Math.round(selectedImage.imageX ?? 0)} step={10} onChange={(value) => updateMapImagePlacement(selectedImage.id, { imageX: value })} />
              <NumberField label="Y" value={Math.round(selectedImage.imageY ?? 0)} step={10} onChange={(value) => updateMapImagePlacement(selectedImage.id, { imageY: value })} />
              <NumberField label="サイズ" value={Math.round(selectedImage.imageWidth ?? project.map.width ?? 1600)} min={16} max={20000} step={10} onChange={(value) => updateMapImagePlacement(selectedImage.id, { imageWidth: value })} />
              <NumberField label="透明度" value={selectedImage.opacity ?? 1} min={0} max={1} step={0.05} onChange={(value) => updateMapImagePlacement(selectedImage.id, { opacity: value })} />
              <div className="inspector-button-row">
                <button type="button" onClick={() => moveMapImageOrder(selectedImage.id, "down")} disabled={selectedIndex <= 0}>
                  下へ
                </button>
                <button type="button" onClick={() => moveMapImageOrder(selectedImage.id, "up")} disabled={selectedIndex >= images.length - 1}>
                  上へ
                </button>
                <button type="button" className="danger" onClick={removeSelectedImage}>
                  削除
                </button>
              </div>
            </>
          )}
        </>
      )}
    </aside>
  );
}
