import { useProjectStore } from "../../store/projectStore";
import { NumberField } from "./InspectorFields";

export function MapImageInspector() {
  const project = useProjectStore((state) => state.project);
  const updateMapImagePlacement = useProjectStore((state) => state.updateMapImagePlacement);
  const map = project.map;
  const x = map.imageX ?? 0;
  const y = map.imageY ?? 0;
  const width = map.imageWidth ?? map.width ?? 1600;
  const height = map.imageHeight ?? map.height ?? 900;

  return (
    <aside className="right-inspector">
      <h2>地図画像</h2>
      {!map.imageDataUrl ? (
        <p className="inspector-note">地図画像が読み込まれていません。</p>
      ) : (
        <>
          <NumberField label="X" value={Math.round(x)} step={10} onChange={(value) => updateMapImagePlacement({ imageX: value })} />
          <NumberField label="Y" value={Math.round(y)} step={10} onChange={(value) => updateMapImagePlacement({ imageY: value })} />
          <NumberField label="W" value={Math.round(width)} min={16} max={20000} step={10} onChange={(value) => updateMapImagePlacement({ imageWidth: value })} />
          <NumberField label="H" value={Math.round(height)} min={16} max={20000} step={10} onChange={(value) => updateMapImagePlacement({ imageHeight: value })} />
        </>
      )}
    </aside>
  );
}
