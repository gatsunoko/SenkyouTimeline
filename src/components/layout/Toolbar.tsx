import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Camera,
  Castle,
  Download,
  FileDown,
  FilePlus2,
  FileUp,
  Flag,
  ImagePlus,
  Maximize2,
  Minimize2,
  MousePointer2,
  PencilLine,
  Redo2,
  RotateCcw,
  Settings2,
  Tags,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useProjectStore } from "../../store/projectStore";
import type { ProjectData, ToolMode } from "../../types/project";
import { downloadJson, readFileAsDataUrl, readJsonFile } from "../../utils/fileIO";

type ToolbarMenu = "file" | "export" | "canvas" | null;

type PrimaryToolMode = Exclude<ToolMode, "mapImageEdit">;

const toolButtons: { tool: PrimaryToolMode; label: string; compactLabel: string; icon: LucideIcon }[] = [
  { tool: "select", label: "選択", compactLabel: "選択", icon: MousePointer2 },
  { tool: "addUnit", label: "コマ追加", compactLabel: "コマ", icon: Flag },
  { tool: "addSite", label: "城追加", compactLabel: "城", icon: Castle },
  { tool: "drawLine", label: "線を描く", compactLabel: "線", icon: PencilLine },
  { tool: "drawArrow", label: "矢印を描く", compactLabel: "矢印", icon: ArrowDownToLine },
  { tool: "addLabel", label: "ラベル追加", compactLabel: "ラベル", icon: Tags },
];

function readImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("地図画像のサイズを取得できませんでした"));
    image.src = dataUrl;
  });
}

export function Toolbar() {
  const project = useProjectStore((state) => state.project);
  const tool = useProjectStore((state) => state.tool);
  const createNewProject = useProjectStore((state) => state.createNewProject);
  const importProject = useProjectStore((state) => state.importProject);
  const exportProject = useProjectStore((state) => state.exportProject);
  const setMapImage = useProjectStore((state) => state.setMapImage);
  const selectObject = useProjectStore((state) => state.selectObject);
  const setTool = useProjectStore((state) => state.setTool);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [exportFpsDraft, setExportFpsDraft] = useState("30");
  const [exportStatus, setExportStatus] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [activeMenu, setActiveMenu] = useState<ToolbarMenu>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onExportStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; busy: boolean }>).detail;
      setExportStatus(detail.message);
      setExportBusy(detail.busy);
    };
    window.addEventListener("sengoku-export-status", onExportStatus);
    return () => window.removeEventListener("sengoku-export-status", onExportStatus);
  }, []);

  useEffect(() => {
    const syncFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    syncFullscreen();
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    const closeOnOutside = (event: MouseEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) setActiveMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveMenu(null);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const onJsonFile = async (file?: File) => {
    if (!file) return;
    const data = await readJsonFile<ProjectData>(file);
    importProject(data);
    setActiveMenu(null);
  };

  const onImageFile = async (file?: File) => {
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    const naturalSize = await readImageDimensions(dataUrl).catch(() => undefined);
    setMapImage(dataUrl, naturalSize);
    setTool("mapImageEdit");
    selectObject("mapImage", "mapImage");
    setActiveMenu(null);
  };

  const onCreateNewProject = () => {
    const confirmed = window.confirm("現在のプロジェクトを空にして新規作成します。保存していない変更は失われます。実行しますか？");
    if (!confirmed) return;
    createNewProject();
    setActiveMenu(null);
  };

  const exportFps = () => {
    const fps = Number(exportFpsDraft);
    return Number.isFinite(fps) ? Math.min(120, Math.max(1, Math.round(fps))) : 30;
  };

  const startTimelineExport = (format: "png-sequence" | "mp4") => {
    const fps = exportFps();
    setExportFpsDraft(String(fps));
    setExportBusy(true);
    setExportStatus(format === "png-sequence" ? "PNG書き出し準備中" : "MP4書き出し準備中");
    window.dispatchEvent(new CustomEvent("sengoku-export-timeline", { detail: { format, fps } }));
  };

  const toggleMenu = (menu: Exclude<ToolbarMenu, null>) => {
    setActiveMenu((current) => (current === menu ? null : menu));
  };

  const editMapImage = () => {
    setTool("mapImageEdit");
    selectObject("mapImage", "mapImage");
    setActiveMenu(null);
  };

  const toggleFullscreen = async () => {
    setActiveMenu(null);
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await document.documentElement.requestFullscreen();
  };

  return (
    <header className="toolbar" ref={toolbarRef}>
      <div className="app-title">
        <span className="app-title-main">戦況図タイムラインエディタ</span>
        <span className="app-title-sub">{project.projectName}</span>
      </div>

      <div className="toolbar-tool-group" aria-label="編集ツール">
        {toolButtons.map(({ tool: mode, label, compactLabel, icon: Icon }) => (
          <button type="button" className={`toolbar-tool-button ${tool === mode ? "is-active" : ""}`} onClick={() => setTool(mode)} title={label} key={mode}>
            <Icon size={17} />
            <span>{compactLabel}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-icon-group" aria-label="履歴と表示">
        <button type="button" className="icon-only" onClick={undo} title="元に戻す">
          <Undo2 size={17} />
        </button>
        <button type="button" className="icon-only" onClick={redo} title="やり直す">
          <Redo2 size={17} />
        </button>
        <button type="button" className="icon-only" onClick={() => window.dispatchEvent(new Event("sengoku-reset-view"))} title="表示位置をリセット">
          <RotateCcw size={17} />
        </button>
      </div>

      <div className="toolbar-menu-buttons">
        <button type="button" className={activeMenu === "file" ? "is-active" : ""} onClick={() => toggleMenu("file")}>
          <FileUp size={17} />
          <span>ファイル</span>
        </button>
        <button type="button" className={activeMenu === "export" ? "is-active" : ""} onClick={() => toggleMenu("export")}>
          <Download size={17} />
          <span>書き出し</span>
        </button>
        <button type="button" className={activeMenu === "canvas" ? "is-active" : ""} onClick={() => toggleMenu("canvas")}>
          <Settings2 size={17} />
          <span>キャンバス</span>
        </button>
      </div>

      <button type="button" className="icon-only toolbar-fullscreen-button" onClick={() => void toggleFullscreen()} title={fullscreen ? "フルスクリーン解除" : "フルスクリーン"}>
        {fullscreen ? <Minimize2 size={26} /> : <Maximize2 size={26} />}
      </button>

      {activeMenu === "file" && (
        <div className="toolbar-popover toolbar-popover-file">
          <h3>ファイル</h3>
          <button type="button" onClick={onCreateNewProject} title="空のプロジェクトを作成">
            <FilePlus2 size={17} />
            新規作成
          </button>
          <button type="button" onClick={() => jsonInputRef.current?.click()} title="プロジェクトJSON読み込み">
            <FileUp size={17} />
            JSONを読み込む
          </button>
          <button type="button" onClick={() => downloadJson(exportProject(), "sengoku-battle-map-project.json")} title="プロジェクトJSON保存">
            <FileDown size={17} />
            JSONを保存
          </button>
        </div>
      )}

      {activeMenu === "export" && (
        <div className="toolbar-popover toolbar-popover-export">
          <h3>書き出し</h3>
          <button type="button" onClick={() => window.dispatchEvent(new Event("sengoku-export-png"))} title="現在表示をPNG出力">
            <Download size={17} />
            現在表示をPNG
          </button>
          <label className="toolbar-field">
            FPS
            <input
              type="number"
              min={1}
              max={120}
              step={1}
              value={exportFpsDraft}
              onChange={(event) => setExportFpsDraft(event.target.value)}
              onBlur={() => setExportFpsDraft(String(exportFps()))}
            />
          </label>
          <div className="toolbar-export-grid">
            <button type="button" onClick={() => startTimelineExport("png-sequence")} disabled={exportBusy} title="タイムラインを連番PNG ZIPとして書き出し">
              <Download size={17} />
              PNG連番
            </button>
            <button type="button" onClick={() => startTimelineExport("mp4")} disabled={exportBusy} title="タイムラインをMP4動画として書き出し">
              <Download size={17} />
              MP4
            </button>
          </div>
          {exportStatus && <span className="toolbar-status">{exportStatus}</span>}
        </div>
      )}

      {activeMenu === "canvas" && (
        <div className="toolbar-popover toolbar-popover-canvas">
          <h3>キャンバス</h3>
          <button type="button" onClick={() => imageInputRef.current?.click()} title="地図画像読み込み">
            <ImagePlus size={17} />
            地図画像を読み込む
          </button>
          <button type="button" onClick={() => selectObject("camera", "exportCamera")} title="書き出しカメラを選択">
            <Camera size={17} />
            書き出しカメラ
          </button>
          {project.map.imageDataUrl && (
            <button type="button" onClick={editMapImage} title="地図画像の位置とサイズを編集">
              <ImagePlus size={17} />
              地図画像編集
            </button>
          )}
        </div>
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
      <input
        ref={jsonInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          void onJsonFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </header>
  );
}
