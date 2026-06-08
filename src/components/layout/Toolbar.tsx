import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Castle,
  Download,
  FileDown,
  FileUp,
  Flag,
  ImagePlus,
  Minus,
  MousePointer2,
  PencilLine,
  Plus,
  Redo2,
  RotateCcw,
  Settings2,
  Tags,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useProjectStore } from "../../store/projectStore";
import type { ProjectData, ToolMode } from "../../types/project";
import { MAP_HEIGHT, MAP_WIDTH } from "../../utils/coordinate";
import { downloadJson, readFileAsDataUrl, readJsonFile } from "../../utils/fileIO";

type ToolbarMenu = "file" | "export" | "canvas" | null;

const toolButtons: { tool: ToolMode; label: string; compactLabel: string; icon: LucideIcon }[] = [
  { tool: "select", label: "選択", compactLabel: "選択", icon: MousePointer2 },
  { tool: "addUnit", label: "コマ追加", compactLabel: "コマ", icon: Flag },
  { tool: "addSite", label: "城追加", compactLabel: "城", icon: Castle },
  { tool: "drawLine", label: "線を描く", compactLabel: "線", icon: PencilLine },
  { tool: "drawArrow", label: "矢印を描く", compactLabel: "矢印", icon: ArrowDownToLine },
  { tool: "addLabel", label: "ラベル追加", compactLabel: "ラベル", icon: Tags },
];

export function Toolbar() {
  const project = useProjectStore((state) => state.project);
  const tool = useProjectStore((state) => state.tool);
  const importProject = useProjectStore((state) => state.importProject);
  const exportProject = useProjectStore((state) => state.exportProject);
  const setMapImage = useProjectStore((state) => state.setMapImage);
  const setMapSize = useProjectStore((state) => state.setMapSize);
  const setMapAreaScale = useProjectStore((state) => state.setMapAreaScale);
  const setTool = useProjectStore((state) => state.setTool);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mapWidth = Math.round(project.map.width ?? MAP_WIDTH);
  const mapHeight = Math.round(project.map.height ?? MAP_HEIGHT);
  const mapAreaScale = mapWidth / MAP_WIDTH;
  const [mapWidthDraft, setMapWidthDraft] = useState(String(mapWidth));
  const [mapHeightDraft, setMapHeightDraft] = useState(String(mapHeight));
  const [exportFpsDraft, setExportFpsDraft] = useState("30");
  const [exportStatus, setExportStatus] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [activeMenu, setActiveMenu] = useState<ToolbarMenu>(null);

  useEffect(() => {
    setMapWidthDraft(String(mapWidth));
    setMapHeightDraft(String(mapHeight));
  }, [mapWidth, mapHeight]);

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
    setMapImage(await readFileAsDataUrl(file));
    setActiveMenu(null);
  };

  const commitMapSizeDraft = () => {
    const nextWidth = Number(mapWidthDraft);
    const nextHeight = Number(mapHeightDraft);
    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) {
      setMapWidthDraft(String(mapWidth));
      setMapHeightDraft(String(mapHeight));
      return;
    }
    setMapSize(nextWidth, nextHeight);
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

      {activeMenu === "file" && (
        <div className="toolbar-popover toolbar-popover-file">
          <h3>ファイル</h3>
          <button type="button" onClick={() => imageInputRef.current?.click()} title="地図画像読み込み">
            <ImagePlus size={17} />
            地図画像を読み込む
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
          <div className="toolbar-field-grid">
            <label className="toolbar-field">
              W
              <input
                type="number"
                min={320}
                max={6000}
                step={10}
                value={mapWidthDraft}
                onChange={(event) => setMapWidthDraft(event.target.value)}
                onBlur={commitMapSizeDraft}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
            <label className="toolbar-field">
              H
              <input
                type="number"
                min={180}
                max={6000}
                step={10}
                value={mapHeightDraft}
                onChange={(event) => setMapHeightDraft(event.target.value)}
                onBlur={commitMapSizeDraft}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
          </div>
          <div className="toolbar-scale-row">
            <button type="button" onClick={() => setMapAreaScale(mapAreaScale - 0.25)} title="配置範囲を縮小">
              <Minus size={17} />
              縮小
            </button>
            <span>{Math.round(mapAreaScale * 100)}%</span>
            <button type="button" onClick={() => setMapAreaScale(mapAreaScale + 0.25)} title="配置範囲を拡大">
              <Plus size={17} />
              拡大
            </button>
          </div>
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
