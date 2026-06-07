import { useProjectStore } from "../../store/projectStore";
import { ColorField, NumberField, TextAreaField, TextField, ToggleField } from "./InspectorFields";

export function LabelInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const updateLabel = useProjectStore((state) => state.updateLabel);
  const label = project.labels.find((entry) => entry.id === id);
  if (!label) return null;
  return (
    <aside className="right-inspector">
      <h2>ラベル編集</h2>
      <TextField label="テキスト" value={label.text} onChange={(value) => updateLabel(label.id, { text: value })} />
      <TextField label="開始日付" value={label.startTime ?? ""} onChange={(value) => updateLabel(label.id, { startTime: value || undefined })} />
      <TextField label="終了日付" value={label.endTime ?? ""} onChange={(value) => updateLabel(label.id, { endTime: value || undefined })} />
      <div className="coordinate-grid">
        <NumberField label="x" value={label.x} min={0} max={1} step={0.001} onChange={(value) => updateLabel(label.id, { x: value })} />
        <NumberField label="y" value={label.y} min={0} max={1} step={0.001} onChange={(value) => updateLabel(label.id, { y: value })} />
      </div>
      <NumberField label="文字サイズ" value={label.fontSize} min={10} max={72} onChange={(value) => updateLabel(label.id, { fontSize: value })} />
      <ColorField label="文字色" value={label.color} onChange={(value) => updateLabel(label.id, { color: value })} />
      <ColorField label="背景色" value={label.backgroundColor} onChange={(value) => updateLabel(label.id, { backgroundColor: value })} />
      <NumberField label="透明度" value={label.opacity} min={0.1} max={1} step={0.05} onChange={(value) => updateLabel(label.id, { opacity: value })} />
      <ToggleField label="表示" checked={label.visible} onChange={(value) => updateLabel(label.id, { visible: value })} />
      <ToggleField label="ロック" checked={label.locked} onChange={(value) => updateLabel(label.id, { locked: value })} />
      <TextAreaField label="メモ" value={label.memo} onChange={(value) => updateLabel(label.id, { memo: value })} />
    </aside>
  );
}
