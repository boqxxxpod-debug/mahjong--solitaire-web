export const MAHJONG_FACES = [
  'characters-1', 'dots-1', 'bamboo-1', 'wind-east',
  'characters-2', 'dots-2', 'bamboo-2', 'wind-south',
  'characters-3', 'dots-3', 'bamboo-3', 'wind-west',
  'characters-4', 'dots-4', 'bamboo-4', 'wind-north',
  'characters-5', 'dots-5', 'bamboo-5', 'dragon-red',
  'characters-6', 'dots-6', 'bamboo-6', 'dragon-green',
  'characters-7', 'dots-7', 'bamboo-7', 'dragon-white',
  'characters-8', 'dots-8', 'bamboo-8',
  'characters-9', 'dots-9', 'bamboo-9',
] as const;

export type MahjongFace = typeof MAHJONG_FACES[number];
export type MahjongSuit = 'characters' | 'dots' | 'bamboo';

const NUMERALS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;
const HONOR_LABELS: Readonly<Record<string, string>> = {
  'wind-east': '東',
  'wind-south': '南',
  'wind-west': '西',
  'wind-north': '北',
  'dragon-red': '中',
  'dragon-green': '發',
  'dragon-white': '白',
};

export function parseSuitedFace(type: string): { suit: MahjongSuit; rank: number } | null {
  const match = /^(characters|dots|bamboo)-([1-9])$/.exec(type);
  return match ? { suit: match[1] as MahjongSuit, rank: Number(match[2]) } : null;
}

export function getTileFaceLabel(type: string): string {
  const suited = parseSuitedFace(type);
  if (suited) {
    const suffix = suited.suit === 'characters' ? '萬' : suited.suit === 'dots' ? '筒' : '索';
    return `${NUMERALS[suited.rank]}${suffix}`;
  }
  return HONOR_LABELS[type] ?? type.replace(/[-_]/g, ' ');
}
