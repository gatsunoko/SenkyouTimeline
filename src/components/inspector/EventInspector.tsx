import { eventTypeLabels } from "../../data/pieceTemplates";
import { useProjectStore } from "../../store/projectStore";
import type { EventType } from "../../types/project";
import { NumberField, SelectField, TextAreaField, TextField } from "./InspectorFields";

export function EventInspector({ id }: { id: string }) {
  const project = useProjectStore((state) => state.project);
  const updateEvent = useProjectStore((state) => state.updateEvent);
  const event = project.events.find((entry) => entry.id === id);
  if (!event) return null;

  return (
    <aside className="right-inspector">
      <h2>イベント編集</h2>
      <TextField label="タイトル" value={event.title} onChange={(value) => updateEvent(event.id, { title: value })} />
      <SelectField<EventType> label="種類" value={event.eventType} options={eventTypeLabels} onChange={(value) => updateEvent(event.id, { eventType: value })} />
      <TextField label="時間 秒" value={event.time} onChange={(value) => updateEvent(event.id, { time: value })} />
      <TextField label="表示名" value={event.displayDate} onChange={(value) => updateEvent(event.id, { displayDate: value })} />
      <div className="coordinate-grid">
        <NumberField label="x" value={event.x} min={0} max={1} step={0.001} onChange={(value) => updateEvent(event.id, { x: value })} />
        <NumberField label="y" value={event.y} min={0} max={1} step={0.001} onChange={(value) => updateEvent(event.id, { y: value })} />
      </div>
      <TextAreaField label="説明" value={event.description} onChange={(value) => updateEvent(event.id, { description: value })} />
      <TextAreaField label="メモ" value={event.memo} onChange={(value) => updateEvent(event.id, { memo: value })} />
    </aside>
  );
}
