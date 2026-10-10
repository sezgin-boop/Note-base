import type { Edge, Node } from '@xyflow/react';

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
  | 'color';

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
  // scene
  number?: number;
  shot?: string;
  duration?: string;
  audio?: string;
  // project
  client?: string;
  deadline?: string;
  fee?: string;
  status?: ProjectStatus;
  // color
  hex?: string;
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
}

export interface BoardContent {
  nodes: CardNode[];
  edges: CardEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  brief: 'Brief',
  shoot: 'Çekim',
  edit: 'Kurgu',
  revision: 'Revizyon',
  delivered: 'Teslim',
  paid: 'Ödendi',
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

export const SHOT_TYPES = ['Geniş', 'Orta', 'Yakın', 'Çok yakın', 'Insert', 'POV', 'Drone', 'B-roll'];
