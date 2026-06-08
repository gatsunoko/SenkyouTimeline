import { useRef } from "react";
import { ImagePlus } from "lucide-react";
import { useProjectStore } from "../../store/projectStore";
import type { RouteDirection, RouteSourceType, Unit, UnitRoute, UnitRouteSegment } from "../../types/project";
import { createId } from "../../utils/id";
import { readFileAsDataUrl } from "../../utils/fileIO";
import { getUnitRouteSegments, resolveUnitFrame, resolveUnitRoutePoint } from "../../utils/interpolation";
import { compareTime, parseTimelineSeconds, sortedFrames } from "../../utils/time";
import { ColorField, NumberField, TextField, ToggleField } from "./InspectorFields";

type RouteOption = {
  value: string;
  sourceType: RouteSourceType;
  sourceId: string;
  label: string;
};

function firstUnitKeyframeTime(unit: Unit, fallback: string) {
  return [...unit.keyframes].sort((a, b) => compareTime(a.time, b.time))[0]?.time ?? fallback;
}

function parseRouteOption(value: string): Pick<UnitRoute, "sourceType" | "sourceId"> | null {
  const [sourceType, sourceId] = value.split(":");
  if ((sourceType !== "line" && sourceType !== "arrow") || !sourceId) return null;
  return { sourceType, sourceId };
}

export function UnitInspector({ id }: { id: string }) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const project = useProjectStore((state) => state.project);
  const updateUnit = useProjectStore((state) => state.updateUnit);
  const setUnitImage = useProjectStore((state) => state.setUnitImage);
  const registerUnitAsset = useProjectStore((state) => state.registerUnitAsset);
  const duplicateUnitFromAsset = useProjectStore((state) => state.duplicateUnitFromAsset);
  const updateUnitKeyframe = useProjectStore((state) => state.updateUnitKeyframe);
  const deleteUnitKeyframe = useProjectStore((state) => state.deleteUnitKeyframe);
  const setUnitRoute = useProjectStore((state) => state.setUnitRoute);
  const toggleUnitRoutePreview = useProjectStore((state) => state.toggleUnitRoutePreview);
  const routePreviewUnitId = useProjectStore((state) => state.routePreviewUnitId);
  const unit = project.units.find((entry) => entry.id === id);
  if (!unit) return null;

  const currentSeconds = parseTimelineSeconds(project.timeline.currentTime);
  const keyframe = unit.keyframes.find((entry) => Math.abs(parseTimelineSeconds(entry.time) - currentSeconds) < 0.05);
  const resolvedFrame = resolveUnitFrame(unit, project.timeline.currentTime, project.timeline.interpolationMode);
  const routePoint = resolveUnitRoutePoint(unit, project.lines, project.arrows, project.timeline.currentTime, project.timeline.interpolationMode);
  const frames = sortedFrames(project.timeline.frames);
  const unitKeyframes = [...unit.keyframes].sort((a, b) => compareTime(a.time, b.time));
  const fallbackStart = firstUnitKeyframeTime(unit, frames[0]?.time ?? project.timeline.currentTime);
  const displayStartTime = unit.displayStartTime ?? fallbackStart;
  const displayEndTime = unit.displayEndTime ?? frames[frames.length - 1]?.time ?? project.timeline.end;
  const linkedAsset = project.unitAssets.find((asset) => asset.id === unit.assetId);
  const currentX = routePoint?.x ?? keyframe?.x ?? resolvedFrame?.x ?? 0.5;
  const currentY = routePoint?.y ?? keyframe?.y ?? resolvedFrame?.y ?? 0.5;
  const currentSize = keyframe?.size ?? resolvedFrame?.size ?? unit.size;
  const routeOptions: RouteOption[] = [
    ...project.lines.map((line) => ({
      value: `line:${line.id}`,
      sourceType: "line" as const,
      sourceId: line.id,
      label: `線: ${line.name}`,
    })),
    ...project.arrows.map((arrow) => ({
      value: `arrow:${arrow.id}`,
      sourceType: "arrow" as const,
      sourceId: arrow.id,
      label: `矢印: ${arrow.name}`,
    })),
  ];
  const routeSegments = getUnitRouteSegments(unit.route);
  const isPreviewingRoute = routePreviewUnitId === unit.id;

  const setDisplayStartTime = (value: string) => {
    updateUnit(unit.id, {
      displayStartTime: value,
      displayEndTime: compareTime(value, displayEndTime) > 0 ? value : displayEndTime,
    });
  };

  const setDisplayEndTime = (value: string) => {
    updateUnit(unit.id, {
      displayStartTime: compareTime(displayStartTime, value) > 0 ? value : displayStartTime,
      displayEndTime: value,
    });
  };

  const routeFromSegments = (segments: UnitRouteSegment[]): UnitRoute | undefined => {
    if (segments.length === 0) return undefined;
    return { ...segments[0], segments };
  };

  const setRouteSegments = (segments: UnitRouteSegment[]) => {
    setUnitRoute(unit.id, routeFromSegments(segments));
  };

  const nextFrameTimeAfter = (time: string) => frames.find((timelineFrame) => compareTime(timelineFrame.time, time) > 0)?.time ?? project.timeline.end;

  const makeRouteSegment = (source: Pick<UnitRouteSegment, "sourceType" | "sourceId">): UnitRouteSegment => {
    const previous = routeSegments[routeSegments.length - 1];
    const startTime = previous?.endTime ?? displayStartTime;
    const endTime = nextFrameTimeAfter(startTime);
    return {
      id: createId("route_segment"),
      ...source,
      startTime,
      endTime: compareTime(startTime, endTime) > 0 ? startTime : endTime,
      direction: previous?.direction ?? "forward",
    };
  };

  const addRouteSegment = () => {
    const fallbackSource = routeOptions.find((option) => !routeSegments.some((segment) => segment.sourceType === option.sourceType && segment.sourceId === option.sourceId)) ?? routeOptions[0];
    if (!fallbackSource) return;
    setRouteSegments([...routeSegments, makeRouteSegment(fallbackSource)]);
  };

  const updateRouteSegment = (index: number, patch: Partial<UnitRouteSegment>) => {
    const nextSegments = routeSegments.map((segment, segmentIndex) => {
      if (segmentIndex !== index) return segment;
      const nextSegment = { ...segment, ...patch };
      if (compareTime(nextSegment.startTime, nextSegment.endTime) > 0) {
        if (patch.startTime !== undefined) nextSegment.endTime = nextSegment.startTime;
        if (patch.endTime !== undefined) nextSegment.startTime = nextSegment.endTime;
      }
      return nextSegment;
    });
    setRouteSegments(nextSegments);
  };

  const removeRouteSegment = (index: number) => {
    setRouteSegments(routeSegments.filter((_, segmentIndex) => segmentIndex !== index));
  };

  const onImageFile = async (file?: File) => {
    if (!file) return;
    const imageDataUrl = await readFileAsDataUrl(file);
    setUnitImage(unit.id, imageDataUrl);
  };

  return (
    <aside className="right-inspector">
      <h2>コマ編集</h2>
      <TextField label="名前" value={unit.name} onChange={(value) => updateUnit(unit.id, { name: value })} />
      <label>
        陣営
        <select value={unit.factionId} onChange={(event) => updateUnit(unit.id, { factionId: event.target.value })}>
          {project.factions.map((faction) => (
            <option value={faction.id} key={faction.id}>
              {faction.name}
            </option>
          ))}
        </select>
      </label>
      <ToggleField label="ロック" checked={unit.locked} onChange={(value) => updateUnit(unit.id, { locked: value })} />

      <h3>画像コマ</h3>
      <h3>名前表示</h3>
      <ColorField label="名前の文字色" value={unit.nameTextColor ?? "#f5efe3"} onChange={(value) => updateUnit(unit.id, { nameTextColor: value })} />
      <ToggleField label="名前に背景" checked={unit.nameBackgroundEnabled ?? false} onChange={(value) => updateUnit(unit.id, { nameBackgroundEnabled: value })} />
      {unit.nameBackgroundEnabled && <ColorField label="名前背景色" value={unit.nameBackgroundColor ?? "#111827"} onChange={(value) => updateUnit(unit.id, { nameBackgroundColor: value })} />}

      {unit.iconUrl && (
        <div className="unit-image-preview">
          <img src={unit.iconUrl} alt="" />
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
      {unit.iconUrl && <ToggleField label="名前を表示" checked={unit.showName !== false} onChange={(value) => updateUnit(unit.id, { showName: value })} />}
      {unit.iconUrl && !unit.assetId && (
        <button type="button" onClick={() => registerUnitAsset(unit.id)}>
          アセットとして登録
        </button>
      )}
      {unit.assetId && (
        <button type="button" onClick={() => duplicateUnitFromAsset(unit.assetId!)}>
          この画像コマを複製
        </button>
      )}

      <h3>表示期間</h3>
      <label>
        表示開始
        <select value={displayStartTime} onChange={(event) => setDisplayStartTime(event.target.value)}>
          {frames.map((timelineFrame) => (
            <option value={timelineFrame.time} key={timelineFrame.id}>
              {timelineFrame.displayDate}
            </option>
          ))}
        </select>
      </label>
      <label>
        表示終了
        <select value={displayEndTime} onChange={(event) => setDisplayEndTime(event.target.value)}>
          {frames.map((timelineFrame) => (
            <option value={timelineFrame.time} key={timelineFrame.id}>
              {timelineFrame.displayDate}
            </option>
          ))}
        </select>
      </label>

      <h3>移動ルート</h3>
      <div className="inspector-button-row">
        <button type="button" onClick={addRouteSegment} disabled={routeOptions.length === 0}>
          ルートを追加
        </button>
        {routeSegments.length > 0 && (
          <>
            <button type="button" onClick={() => toggleUnitRoutePreview(unit.id)}>
              {isPreviewingRoute ? "確認終了" : "ルート確認"}
            </button>
            <button type="button" className="danger" onClick={() => setUnitRoute(unit.id, undefined)}>
              すべて解除
            </button>
          </>
        )}
      </div>
      {routeSegments.length > 0 && (
        <div className="route-segment-list">
          {routeSegments.map((segment, index) => {
            const routeValue = `${segment.sourceType}:${segment.sourceId}`;
            const routeSourceExists = routeOptions.some((option) => option.value === routeValue);
            return (
              <div className="route-segment-card" key={segment.id}>
                <div className="route-segment-header">
                  <span>ルート {index + 1}</span>
                  <button type="button" className="icon-only danger" onClick={() => removeRouteSegment(index)}>
                    削除
                  </button>
                </div>
                {!routeSourceExists && <small className="inline-warning">割り当て先が見つかりません</small>}
                <label>
                  線/矢印
                  <select
                    value={routeValue}
                    onChange={(event) => {
                      const source = parseRouteOption(event.target.value);
                      if (source) updateRouteSegment(index, source);
                    }}
                  >
                    {routeOptions.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  始点到達
                  <select value={segment.startTime} onChange={(event) => updateRouteSegment(index, { startTime: event.target.value })}>
                    {frames.map((timelineFrame) => (
                      <option value={timelineFrame.time} key={timelineFrame.id}>
                        {timelineFrame.displayDate}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  終点到達
                  <select value={segment.endTime} onChange={(event) => updateRouteSegment(index, { endTime: event.target.value })}>
                    {frames.map((timelineFrame) => (
                      <option value={timelineFrame.time} key={timelineFrame.id}>
                        {timelineFrame.displayDate}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  方向
                  <select value={segment.direction} onChange={(event) => updateRouteSegment(index, { direction: event.target.value as RouteDirection })}>
                    <option value="forward">始点から終点</option>
                    <option value="reverse">終点から始点</option>
                  </select>
                </label>
              </div>
            );
          })}
        </div>
      )}

      <h3>現在時間のキーフレーム</h3>
      <div className="coordinate-grid">
        <NumberField label="x" value={currentX} min={0} max={1} step={0.001} onChange={(value) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x: value, y: currentY })} />
        <NumberField label="y" value={currentY} min={0} max={1} step={0.001} onChange={(value) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x: currentX, y: value })} />
      </div>
      <NumberField label="サイズ" value={currentSize} min={0.2} max={4} step={0.05} onChange={(value) => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x: currentX, y: currentY, size: value, status: unit.status })} />
      <button type="button" onClick={() => updateUnitKeyframe(unit.id, project.timeline.currentTime, { x: currentX, y: currentY, status: unit.status })}>
        現在時間にキーフレーム追加/更新
      </button>
      <button type="button" className="danger" onClick={() => deleteUnitKeyframe(unit.id, project.timeline.currentTime)}>
        現在時間のキーフレーム削除
      </button>

      <h3>このコマのキーフレーム</h3>
      <div className="point-list">
        {unitKeyframes.map((entry, index) => (
          <div className="point-row keyframe-row" key={`${unit.id}-keyframe-${entry.time}-${index}`}>
            <span>{entry.displayDate || entry.time}</span>
            <small>
              x {entry.x.toFixed(3)} / y {entry.y.toFixed(3)}
              {entry.size !== undefined ? ` / size ${entry.size.toFixed(2)}` : ""}
            </small>
            <button type="button" className="icon-only danger" onClick={() => deleteUnitKeyframe(unit.id, entry.time)}>
              削除
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
