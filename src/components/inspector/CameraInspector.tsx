import { resolveCameraFrame } from "../../utils/interpolation";
import { compareTime, parseTimelineSeconds } from "../../utils/time";
import { useProjectStore } from "../../store/projectStore";
import { NumberField } from "./InspectorFields";

export function CameraInspector() {
  const project = useProjectStore((state) => state.project);
  const updateExportCamera = useProjectStore((state) => state.updateExportCamera);
  const updateCameraKeyframe = useProjectStore((state) => state.updateCameraKeyframe);
  const deleteCameraKeyframe = useProjectStore((state) => state.deleteCameraKeyframe);
  const camera = project.map.exportCamera ?? {
    width: project.map.outputWidth,
    height: project.map.outputHeight,
    keyframes: [{ time: project.timeline.currentTime, displayDate: project.timeline.currentTime, x: 0, y: 0 }],
  };
  const frame = resolveCameraFrame(camera, project.timeline.currentTime, project.timeline.interpolationMode);
  const keyframes = [...camera.keyframes].sort((a, b) => compareTime(a.time, b.time));
  const currentSeconds = parseTimelineSeconds(project.timeline.currentTime);

  return (
    <aside className="right-inspector">
      <h2>書き出しカメラ</h2>
      <NumberField label="出力W(px)" value={camera.width} min={64} max={7680} step={10} onChange={(value) => updateExportCamera({ width: value })} />
      <NumberField label="出力H(px)" value={camera.height} min={64} max={4320} step={10} onChange={(value) => updateExportCamera({ height: value })} />
      <h3>現在時刻の範囲</h3>
      <NumberField label="X" value={Math.round(frame.x)} step={10} onChange={(value) => updateCameraKeyframe(project.timeline.currentTime, { x: value })} />
      <NumberField label="Y" value={Math.round(frame.y)} step={10} onChange={(value) => updateCameraKeyframe(project.timeline.currentTime, { y: value })} />
      <h3>キーフレーム</h3>
      <div className="keyframe-list">
        {keyframes.map((keyframe) => {
          const isCurrent = Math.abs(parseTimelineSeconds(keyframe.time) - currentSeconds) < 0.05;
          return (
            <div className={`point-row keyframe-row ${isCurrent ? "is-selected" : ""}`} key={keyframe.time}>
              <span>
                <strong>{keyframe.displayDate}</strong>
                <small>
                  X {Math.round(keyframe.x)} / Y {Math.round(keyframe.y)}
                </small>
              </span>
              <button type="button" disabled={keyframes.length <= 1} onClick={() => deleteCameraKeyframe(keyframe.time)}>
                削除
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
