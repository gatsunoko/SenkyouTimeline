import type Konva from "konva";
import { downloadDataUrl } from "./fileIO";

export function exportStageToPng(stage: Konva.Stage, filename: string) {
  const dataUrl = stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
  downloadDataUrl(dataUrl, filename);
}
