export type Tool = 'pen' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'text';

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
  userId: string;
  text?: string;
}

export interface ChatMessage {
  id: string;
  userName: string;
  text: string;
  timestamp: number;
}
