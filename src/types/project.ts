export type CalendarType = "japanese_lunisolar" | "gregorian" | "custom";
export type InterpolationMode = "none" | "linear";

export type UnitType =
  | "taisho"
  | "honjin"
  | "busho"
  | "vanguard"
  | "main_force"
  | "detached"
  | "ambush"
  | "reinforcement"
  | "retreating"
  | "castle_garrison"
  | "ashigaru"
  | "spear"
  | "teppo"
  | "archer"
  | "cavalry"
  | "navy"
  | "ikki"
  | "temple_army"
  | "supply"
  | "scout"
  | "messenger";

export type TroopType =
  | "mixed"
  | "infantry"
  | "spear"
  | "teppo"
  | "archer"
  | "cavalry"
  | "navy"
  | "supply"
  | "unknown";

export type UnitStatus =
  | "normal"
  | "moving"
  | "arrived"
  | "battle"
  | "attack"
  | "retreat"
  | "siege"
  | "surrounded"
  | "defending"
  | "defected"
  | "destroyed"
  | "surrendered"
  | "hidden"
  | "food_shortage";

export type UnitShape = "rectangle" | "pentagon" | "convex";

export type Certainty = "confirmed" | "probable" | "possible" | "uncertain" | "fictional";

export type SiteStatus =
  | "normal"
  | "occupied"
  | "under_siege"
  | "fallen"
  | "burned"
  | "surrendered"
  | "abandoned"
  | "unknown";

export type LineType =
  | "siege_line"
  | "blockade_line"
  | "defense_line"
  | "frontline"
  | "border"
  | "road_route"
  | "river_line"
  | "other";

export type LineCurveMode = "straight" | "curve";
export type RouteSourceType = "line" | "arrow";
export type RouteDirection = "forward" | "reverse";

export type ArrowType =
  | "advance"
  | "retreat"
  | "reinforcement"
  | "supply"
  | "attack"
  | "escape"
  | "messenger"
  | "estimated";

export type EventType =
  | "departure"
  | "arrival"
  | "battle"
  | "ambush"
  | "night_attack"
  | "siege_start"
  | "fall"
  | "surrender"
  | "seppuku"
  | "execution"
  | "defection"
  | "betrayal"
  | "burning"
  | "food_shortage"
  | "reinforcement"
  | "retreat"
  | "peace"
  | "other";

export type SelectableType = "faction" | "factionSettings" | "unit" | "site" | "image" | "region" | "line" | "arrow" | "event" | "label" | "camera" | "mapImage";
export type ToolMode = "select" | "addUnit" | "addSite" | "addImage" | "drawRegion" | "drawLine" | "drawArrow" | "addLabel" | "mapImageEdit";

export interface MapPoint {
  x: number;
  y: number;
}

export interface CameraKeyframe extends MapPoint {
  time: string;
  displayDate: string;
  scale?: number;
}

export interface ExportCamera {
  width: number;
  height: number;
  scale?: number;
  keyframes: CameraKeyframe[];
}

export interface ProjectMap {
  imageDataUrl?: string;
  imagePath?: string;
  imageX?: number;
  imageY?: number;
  imageWidth?: number;
  imageHeight?: number;
  imageNaturalWidth?: number;
  imageNaturalHeight?: number;
  width?: number;
  height?: number;
  outputWidth: number;
  outputHeight: number;
  exportCamera?: ExportCamera;
}

export interface TimelineFrame {
  id: string;
  time: string;
  displayDate: string;
  order: number;
  memo: string;
}

export interface Timeline {
  start: string;
  end: string;
  currentTime: string;
  calendarType: CalendarType;
  defaultStep: string;
  interpolationMode: InterpolationMode;
  frames: TimelineFrame[];
}

export interface Faction {
  id: string;
  name: string;
  color: string;
  showInCameraLegend?: boolean;
  cameraLegendTextOutlineColor?: string;
  memo: string;
}

export interface CameraLegendSettings {
  showFactions: boolean;
  factionSize: number;
}

export interface UnitAsset {
  id: string;
  name: string;
  imageDataUrl?: string;
  size: number;
  factionId: string;
  shape?: UnitShape;
  borderColor?: string;
  rotation?: number;
  showName?: boolean;
  nameFontSize?: number;
  nameTextColor?: string;
  nameBold?: boolean;
  nameBackgroundEnabled?: boolean;
  nameBackgroundColor?: string;
  nameOutlineEnabled?: boolean;
  nameOutlineColor?: string;
}

export interface SiteAsset {
  id: string;
  name: string;
  imageDataUrl?: string;
  size: number;
  factionId: string;
  nameFontSize?: number;
  nameTextColor?: string;
  nameBold?: boolean;
  nameBackgroundEnabled?: boolean;
  nameBackgroundColor?: string;
  nameOutlineEnabled?: boolean;
  nameOutlineColor?: string;
}

export interface ImageAsset {
  id: string;
  name: string;
  imageDataUrl: string;
  naturalWidth?: number;
  naturalHeight?: number;
  size: number;
}

export interface SiteKeyframe {
  time: string;
  displayDate: string;
  factionId: string;
}

export interface PlacedImageKeyframe extends MapPoint {
  time: string;
  displayDate: string;
}

export interface UnitKeyframe extends MapPoint {
  time: string;
  displayDate: string;
  rotation: number;
  size?: number;
  status: UnitStatus;
  factionId?: string;
  certainty?: Certainty;
  sourceNote?: string;
}

export interface UnitRouteSegment {
  id: string;
  sourceType: RouteSourceType;
  sourceId: string;
  startTime: string;
  endTime: string;
  direction: RouteDirection;
  fallbackPoints?: MapPoint[];
}

export interface UnitRoute extends UnitRouteSegment {
  segments?: UnitRouteSegment[];
}

export interface Unit {
  id: string;
  name: string;
  x?: number;
  y?: number;
  factionId: string;
  unitType: UnitType;
  commander: string;
  troopType: TroopType;
  strengthText: string;
  status: UnitStatus;
  certainty: Certainty;
  locked: boolean;
  size: number;
  rotation?: number;
  shape?: UnitShape;
  borderColor?: string;
  displayStartTime?: string;
  displayEndTime?: string;
  assetId?: string;
  showName?: boolean;
  nameFontSize?: number;
  nameTextColor?: string;
  nameBold?: boolean;
  nameBackgroundEnabled?: boolean;
  nameBackgroundColor?: string;
  nameOutlineEnabled?: boolean;
  nameOutlineColor?: string;
  memo: string;
  sourceNote: string;
  iconUrl?: string;
  route?: UnitRoute;
  keyframes: UnitKeyframe[];
}

export interface Site extends MapPoint {
  id: string;
  name: string;
  factionId: string;
  status: SiteStatus;
  certainty: Certainty;
  memo: string;
  sourceNote: string;
  locked: boolean;
  size?: number;
  nameFontSize?: number;
  assetId?: string;
  showName?: boolean;
  nameTextColor?: string;
  nameBold?: boolean;
  nameBackgroundEnabled?: boolean;
  nameBackgroundColor?: string;
  nameOutlineEnabled?: boolean;
  nameOutlineColor?: string;
  iconUrl?: string;
  keyframes?: SiteKeyframe[];
}

export interface PlacedImage extends MapPoint {
  id: string;
  name: string;
  imageDataUrl: string;
  naturalWidth?: number;
  naturalHeight?: number;
  assetId?: string;
  size: number;
  locked: boolean;
  memo: string;
  keyframes: PlacedImageKeyframe[];
}

export interface LineKeyframe {
  time: string;
  displayDate: string;
  points: MapPoint[];
  sourceNote: string;
}

export interface ArrowKeyframe {
  time: string;
  displayDate: string;
  points: MapPoint[];
  sourceNote: string;
}

export interface RegionKeyframe {
  time: string;
  displayDate: string;
  points: MapPoint[];
}

export interface LabelKeyframe extends MapPoint {
  time: string;
  displayDate: string;
}

export interface BattleLine {
  id: string;
  name: string;
  lineType: LineType;
  factionId: string;
  color: string;
  width: number;
  opacity: number;
  dashed: boolean;
  outlineEnabled?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
  curveMode?: LineCurveMode;
  hideWhenRoute?: boolean;
  locked: boolean;
  displayStartTime?: string;
  displayEndTime?: string;
  certainty: Certainty;
  memo: string;
  sourceNote: string;
  keyframes: LineKeyframe[];
}

export interface BattleArrow {
  id: string;
  name: string;
  arrowType: ArrowType;
  factionId: string;
  unitId?: string;
  color: string;
  width: number;
  arrowHeadSize?: number;
  opacity: number;
  dashed: boolean;
  outlineEnabled?: boolean;
  outlineColor?: string;
  outlineWidth?: number;
  curveMode?: LineCurveMode;
  hideWhenRoute?: boolean;
  revealAlongPath?: boolean;
  revealDurationSeconds?: number;
  startTime: string;
  endTime: string;
  points: MapPoint[];
  keyframes?: ArrowKeyframe[];
  locked: boolean;
  certainty: Certainty;
  memo: string;
  sourceNote: string;
}

export interface MapRegion {
  id: string;
  name: string;
  factionId: string;
  points: MapPoint[];
  fillColor: string;
  useFactionColor: boolean;
  opacity: number;
  displayOrder: number;
  borderEnabled: boolean;
  borderColor: string;
  borderWidth: number;
  showName: boolean;
  nameBold?: boolean;
  locked: boolean;
  displayStartTime?: string;
  displayEndTime?: string;
  memo: string;
  keyframes?: RegionKeyframe[];
}

export interface BattleEvent extends MapPoint {
  id: string;
  eventType: EventType;
  title: string;
  time: string;
  displayDate: string;
  description: string;
  certainty: Certainty;
  memo: string;
  sourceNote: string;
}

export interface MapLabel extends MapPoint {
  id: string;
  text: string;
  startTime?: string;
  endTime?: string;
  fontSize: number;
  color: string;
  backgroundEnabled?: boolean;
  backgroundColor: string;
  outlineEnabled?: boolean;
  outlineColor?: string;
  borderEnabled?: boolean;
  borderColor: string;
  bold?: boolean;
  opacity: number;
  locked: boolean;
  memo: string;
  keyframes?: LabelKeyframe[];
}

export interface ProjectData {
  version: string;
  projectName: string;
  description: string;
  cameraLegend?: CameraLegendSettings;
  timeline: Timeline;
  map: ProjectMap;
  unitAssets: UnitAsset[];
  siteAssets: SiteAsset[];
  imageAssets: ImageAsset[];
  factions: Faction[];
  sites: Site[];
  images: PlacedImage[];
  units: Unit[];
  regions: MapRegion[];
  lines: BattleLine[];
  arrows: BattleArrow[];
  events: BattleEvent[];
  labels: MapLabel[];
}

export interface SelectionState {
  type: SelectableType | null;
  id: string | null;
}

export type MovableSelectionType = "unit" | "site" | "image" | "region" | "line" | "arrow" | "label";

export type SelectionMoveUpdate =
  | { type: "unit"; id: string; x: number; y: number }
  | { type: "site"; id: string; x: number; y: number }
  | { type: "image"; id: string; x: number; y: number }
  | { type: "label"; id: string; x: number; y: number }
  | { type: "region"; id: string; points: MapPoint[] }
  | { type: "line"; id: string; points: MapPoint[] }
  | { type: "arrow"; id: string; points: MapPoint[] };
