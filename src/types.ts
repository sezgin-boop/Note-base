import type { Edge, Node } from '@xyflow/react';
import type { Skin } from './skins';

export type CardType =
  | 'note'
  | 'heading'
  | 'todo'
  | 'image'
  | 'video'
  | 'link'
  | 'board'
  | 'frame'
  | 'scene'
  | 'project'
  | 'color'
  | 'draw';

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

export interface VideoComment {
  id: string;
  /** Seconds into the video, or null for a general comment. */
  t: number | null;
  text: string;
  author?: string;
  at: number;
  done?: boolean;
  /** Version id the comment belongs to; missing means the first version. */
  v?: string;
}

export interface VideoVersion {
  id: string;
  label: string;
  mediaId?: string;
  url?: string;
  aspect?: number;
  at: number;
}

export interface Approval {
  /** Id of the client's approval row, so it is applied once. */
  id: string;
  version: string;
  by: string;
  at: number;
}

export type ProjectStatus = 'brief' | 'shoot' | 'edit' | 'revision' | 'delivered' | 'paid';

export interface CardData extends Record<string, unknown> {
  color?: string;
  title?: string;
  text?: string;
  items?: TodoItem[];
  mediaId?: string;
  url?: string;
  caption?: string;
  boardId?: string;
  // video
  comments?: VideoComment[];
  aspect?: number;
  versions?: VideoVersion[];
  versionId?: string;
  approvals?: Approval[];
  // drawing (pen strokes, lines, arrows, shapes, free text)
  shape?: 'pen' | 'marker' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text';
  /** x, y pairs relative to the card, in a w × h box (the card may be resized: it scales). */
  points?: number[];
  w?: number;
  h?: number;
  stroke?: string;
  size?: number;
  /** Cards uploaded through the same upload link (they line up together). */
  batch?: string;
  /** Card style: a preset, a color / gradient or a picture as the whole card's background. */
  skin?: Skin;
  /** Custom header text replacing the card type ("Note", "Scene 01"…). */
  label?: string;
  textSize?: 'sm' | 'lg';
  // planning (any card)
  tags?: string[];
  publishDate?: string;
  platform?: string;
  // scene
  number?: number;
  shot?: string;
  duration?: string;
  audio?: string;
  /** Text-to-image prompt for generating this scene's frame. */
  prompt?: string;
  /** The frame (picture) area is folded away. */
  hideFrame?: boolean;
  // project
  client?: string;
  deadline?: string;
  fee?: string;
  status?: ProjectStatus;
  // color
  hex?: string;
  // section (frame)
  /** Folded into a compact bar; `members` are the hidden cards, `openSize` the size to unfold to. */
  collapsed?: boolean;
  members?: string[];
  openSize?: { width: number; height: number };
  /** Emoji shown before the section title. */
  icon?: string;
  look?: 'tint' | 'solid' | 'outline' | 'dashed';
}

export type CardNode = Node<CardData, CardType>;
export type CardEdge = Edge;

export interface BoardMeta {
  id: string;
  name: string;
  icon: string;
  parentId: string | null;
  updatedAt: number;
  /** Public share token; the board and its sub-boards are readable via /s/<shareId>. */
  shareId?: string | null;
  shareComments?: boolean;
  /** The quick-capture inbox board. */
  inbox?: boolean;
}

export interface BoardContent {
  nodes: CardNode[];
  edges: CardEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  brief: 'Brief',
  shoot: 'Shoot',
  edit: 'Edit',
  revision: 'Revision',
  delivered: 'Delivered',
  paid: 'Paid',
};

export const STATUS_COLORS: Record<ProjectStatus, string> = {
  brief: '#a1a1aa',
  shoot: '#f59e0b',
  edit: '#a78bfa',
  revision: '#f87171',
  delivered: '#38bdf8',
  paid: '#34d399',
};

export const ACCENTS = ['', '#a78bfa', '#38bdf8', '#34d399', '#f59e0b', '#f87171', '#f472b6'];

export const SHOT_TYPES = ['Wide', 'Medium', 'Close-up', 'Extreme close-up', 'Insert', 'POV', 'Drone', 'B-roll'];

export const PLATFORMS: Record<string, string> = {
  YouTube: '#f87171',
  Shorts: '#fb7185',
  Instagram: '#f472b6',
  Reels: '#e879f9',
  TikTok: '#2dd4bf',
  X: '#a1a1aa',
  LinkedIn: '#60a5fa',
  Podcast: '#a78bfa',
  Client: '#38bdf8',
  Other: '#fbbf24',
};
