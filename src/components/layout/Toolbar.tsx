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
  Tags,
  Undo2,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useProjectStore } from "../../store/projectStore";
import type { ProjectData, ToolMode } from "../../types/project";
import { MAP_HEIGHT, MAP_WIDTH } from "../../utils/coordinate";
import { downloadJson, readFileAsDataUrl, readJsonFile } from "../../utils/fileIO";

const toolButtons: { tool: ToolMode; label: string; icon: LucideIcon }[] = [
  { tool: "select", label: "選択", icon: MousePointer2 },
  { tool: "addUnit", label: "コマ追加", icon: Flag },
  { tool: "addSite", label: "城追加", icon: Castle },
  { tool: "drawLine", label: "線を描く", icon: PencilLine },
  { tool: "drawArrow", label: "矢印を描く", icon: ArrowDownToLine },
  { tool: "addLabel", label: "ラベル追加", icon: Tags },
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
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mapWidth = Math.round(project.map.width ?? MAP_WIDTH);
  const mapHeight = Math.round(project.map.height ?? MAP_HEIGHT);
  const mapAreaScale = mapWidth / MAP_WIDTH;
  const [mapWidthDraft, setMapWidthDraft] = useState(String(mapWidth));
  const [mapHeightDraft, setMapHeightDraft] = useState(String(mapHeight));

  useEffect(() => {
    setMapWidthDraft(String(mapWidth));
    setMapHeightDraft(String(mapHeight));
  }, [mapWidth, mapHeight]);

  const onJsonFile = async (file?: File) => {
    if (!file) return;
    const data = await readJsonFile<ProjectData>(file);
    importProject(data);
  };

  const onImageFile = async (file?: File) => {
    if (!file) return;
    setMapImage(await readFileAsDataUrl(file));
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

  return (
    <header className="toolbar">
      <div className="app-title">
        <span className="app-title-main">戦国戦況図タイムラインエディタ</span>
        <span className="app-title-sub">{project.projectName}</span>
      </div>

      <button type="button" onClick={() => imageInputRef.current?.click()} title="地図画像読み込み">
        <ImagePlus size={17} />
        地図画像
      </button>
      <button type="button" onClick={() => jsonInputRef.current?.click()} title="プロジェクトJSON読み込み">
        <FileUp size={17} />
        JSON読込
      </button>
      <button type="button" onClick={() => downloadJson(exportProject(), "sengoku-battle-map-project.json")} title="プロジェクトJSON保存">
        <FileDown size={17} />
        JSON保存
      </button>
      <button type="button" onClick={() => window.dispatchEvent(new Event("sengoku-export-png"))} title="PNG出力">
        <Download size={17} />
        PNG
      </button>
      <button type="button" onClick={undo} title="Undo">
        <Undo2 size={17} />
      </button>
      <button type="button" onClick={redo} title="Redo">
        <Redo2 size={17} />
      </button>

      <div className="toolbar-divider" />
      {toolButtons.map(({ tool: mode, label, icon: Icon }) => (
        <button type="button" className={tool === mode ? "is-active" : ""} onClick={() => setTool(mode)} title={label} key={mode}>
          <Icon size={17} />
          {label}
        </button>
      ))}
      <button type="button" onClick={() => window.dispatchEvent(new Event("sengoku-reset-view"))} title="ズームと表示位置をリセット">
        <RotateCcw size={17} />
        リセット
      </button>

      <div className="toolbar-divider" />
      <label className="toolbar-size-label" title="入力後、Enterまたはフォーカスを外すと反映">
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
      <label className="toolbar-size-label" title="入力後、Enterまたはフォーカスを外すと反映">
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
      <button type="button" onClick={() => setMapAreaScale(mapAreaScale - 0.25)} title="キャンバス範囲を縮小">
        <Minus size={17} />
        範囲
      </button>
      <span className="toolbar-meter">{Math.round(mapAreaScale * 100)}%</span>
      <button type="button" onClick={() => setMapAreaScale(mapAreaScale + 0.25)} title="キャンバス範囲を拡大">
        <Plus size={17} />
        範囲
      </button>

      <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(event) => void onImageFile(event.target.files?.[0])} />
      <input ref={jsonInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => void onJsonFile(event.target.files?.[0])} />
      <Upload size={0} aria-hidden />
    </header>
  );
}
