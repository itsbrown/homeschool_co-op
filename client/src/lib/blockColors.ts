export type BlockType = 'anchor' | 'curriculum' | 'flexible';

export const BLOCK_TYPE_COLORS: Record<BlockType, string> = {
  anchor: "border-l-indigo-500",
  curriculum: "border-l-purple-500",
  flexible: "border-l-slate-500",
};

export const BLOCK_TYPE_BADGE_COLORS: Record<BlockType, string> = {
  anchor: "bg-indigo-100 text-indigo-800",
  curriculum: "bg-purple-100 text-purple-800",
  flexible: "bg-slate-100 text-slate-800",
};
