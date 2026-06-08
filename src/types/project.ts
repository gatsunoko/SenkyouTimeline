export type CalendarType = "japanese_lunisolar" | "gregorian" | "custom";
export type InterpolationMode = "none" | "linear";

export type FactionType =
  | "daimyo"
  | "alliance"
  | "kokujin"
  | "temple"
  | "ikki"
  | "shogunate"
  | "imperial"
  | "neutral"
  | "unknown";

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

export type UnitShape = "rectangle" | "pentagon";

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

export type SelectableType = "faction" | "unit" | "site" | "line" | "arrow" | "event" | "label" | "frame";
export type ToolMode = "select" | "addUnit" | "addSite" | "drawLine" | "drawArrow" | "addLabel";

export interface MapPoint {
  x: number;
  y: number;
}

export interface ProjectMap {
  imageDataUrl?: string;
  imagePath?: string;
  width?: number;
  height?: number;
  outputWidth: number;
  outputHeight: number;
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
  shortName: string;
  color: string;
  type: FactionType;
  memo: string;
}

export interface UnitAsset {
  id: string;
  name: string;
  imageDataUrl: string;
  size: number;
  factionId: string;
  shape?: UnitShape;
  nameTextColor?: string;
  nameBackgroundEnabled?: boolean;
  nameBackgroundColor?: string;
}

export interface SiteAsset {
  id: string;
  name: string;
  imageDataUrl: string;
  size: number;
  nameFontSize?: number;
  nameTextColor?: string;
  nameBackgroundEnabled?: boolean;
  nameBackgroundColor?: string;
}

export interface SiteKeyframe {
  time: string;
  displayDate: string;
  factionId: string;
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
  shortName: string;
  factionId: string;
  unitType: UnitType;
  commander: string;
  troopType: TroopType;
  strengthText: string;
  status: UnitStatus;
  certainty: Certainty;
  locked: boolean;
  size: number;
  shape?: UnitShape;
  displayStartTime?: string;
  displayEndTime?: string;
  assetId?: string;
  showName?: boolean;
  nameTextColor?: string;
  nameBackgroundEnabled?: boolean;
  nameBackgroundColor?: string;
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
  nameBackgroundEnabled?: boolean;
  nameBackgroundColor?: string;
  iconUrl?: string;
  keyframes?: SiteKeyframe[];
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

export interface BattleLine {
  id: string;
  name: string;
  lineType: LineType;
  factionId: string;
  color: string;
  width: number;
  opacity: number;
  dashed: boolean;
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
  curveMode?: LineCurveMode;
  hideWhenRoute?: boolean;
  startTime: string;
  endTime: string;
  points: MapPoint[];
  keyframes?: ArrowKeyframe[];
  locked: boolean;
  certainty: Certainty;
  memo: string;
  sourceNote: string;
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
  backgroundColor: string;
  borderColor: string;
  opacity: number;
  locked: boolean;
  memo: string;
}

export interface ProjectData {
  version: string;
  projectName: string;
  description: string;
  timeline: Timeline;
  map: ProjectMap;
  unitAssets: UnitAsset[];
  siteAssets: SiteAsset[];
  factions: Faction[];
  sites: Site[];
  units: Unit[];
  lines: BattleLine[];
  arrows: BattleArrow[];
  events: BattleEvent[];
  labels: MapLabel[];
}

export interface SelectionState {
  type: SelectableType | null;
  id: string | null;
}
