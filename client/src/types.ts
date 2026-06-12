export type Tool = 'pen' | 'eraser' | 'line' | 'rectangle' | 'circle';

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
}
