import type {
  ArrowType,
  Certainty,
  EventType,
  LineType,
  SiteStatus,
  TroopType,
  UnitStatus,
  UnitType,
} from "../types/project";

export const certaintyLabels: Record<Certainty, string> = {
  confirmed: "確定",
  probable: "有力",
  possible: "可能性あり",
  uncertain: "不明",
  fictional: "作図用",
};

export const unitTypeLabels: Record<UnitType, string> = {
  taisho: "大将",
  honjin: "本陣",
  busho: "武将",
  vanguard: "先鋒",
  main_force: "本隊",
  detached: "別働隊",
  ambush: "伏兵",
  reinforcement: "援軍",
  retreating: "撤退中",
  castle_garrison: "城兵",
  ashigaru: "足軽",
  spear: "槍隊",
  teppo: "鉄砲隊",
  archer: "弓隊",
  cavalry: "騎馬隊",
  navy: "水軍",
  ikki: "一揆",
  temple_army: "寺社兵",
  supply: "補給",
  scout: "斥候",
  messenger: "使者",
};

export const unitTypeIcons: Record<UnitType, string> = {
  taisho: "将",
  honjin: "本",
  busho: "武",
  vanguard: "先",
  main_force: "隊",
  detached: "別",
  ambush: "伏",
  reinforcement: "援",
  retreating: "退",
  castle_garrison: "城",
  ashigaru: "足",
  spear: "槍",
  teppo: "砲",
  archer: "弓",
  cavalry: "馬",
  navy: "船",
  ikki: "一",
  temple_army: "寺",
  supply: "補",
  scout: "斥",
  messenger: "使",
};

export const troopTypeLabels: Record<TroopType, string> = {
  mixed: "混成",
  infantry: "歩兵",
  spear: "槍",
  teppo: "鉄砲",
  archer: "弓",
  cavalry: "騎馬",
  navy: "水軍",
  supply: "補給",
  unknown: "不明",
};

export const unitStatusLabels: Record<UnitStatus, string> = {
  normal: "通常",
  moving: "移動中",
  arrived: "到着",
  battle: "交戦",
  attack: "攻撃",
  retreat: "撤退",
  siege: "包囲",
  surrounded: "包囲される",
  defending: "防御",
  defected: "寝返り",
  destroyed: "壊滅",
  surrendered: "降伏",
  hidden: "非表示",
  food_shortage: "兵糧不足",
};

export const siteStatusLabels: Record<SiteStatus, string> = {
  normal: "通常",
  occupied: "占領",
  under_siege: "包囲中",
  fallen: "落城",
  burned: "焼失",
  surrendered: "降伏",
  abandoned: "放棄",
  unknown: "不明",
};

export const lineTypeLabels: Record<LineType, string> = {
  siege_line: "包囲線",
  blockade_line: "封鎖線",
  defense_line: "防御線",
  frontline: "前線",
  border: "境界",
  road_route: "経路",
  river_line: "河川",
  other: "その他",
};

export const arrowTypeLabels: Record<ArrowType, string> = {
  advance: "進軍",
  retreat: "撤退",
  reinforcement: "援軍",
  supply: "補給",
  attack: "攻撃",
  escape: "脱出",
  messenger: "伝令",
  estimated: "作図用",
};

export const eventTypeLabels: Record<EventType, string> = {
  departure: "出発",
  arrival: "到着",
  battle: "戦闘",
  ambush: "奇襲",
  night_attack: "夜襲",
  siege_start: "包囲開始",
  fall: "落城",
  surrender: "降伏",
  seppuku: "切腹",
  execution: "処刑",
  defection: "寝返り",
  betrayal: "離反",
  burning: "焼き討ち",
  food_shortage: "兵糧不足",
  reinforcement: "援軍到着",
  retreat: "退却",
  peace: "和議",
  other: "その他",
};

