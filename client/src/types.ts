export type Tool = 'pen' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'text' | 'select' | 'image';

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
  imageData?: string;
}

export interface ChatMessage {
  id: string;
  userName: string;
  text: string;
  timestamp: number;
  imageData?: string;
}

export interface TabInfo {
  id: string;
  name: string;
}

export interface UserTabInfo {
  userId: string;
  userName: string;
  tabId: string;
}

export interface InitRoomData {
  tabs: TabInfo[];
  currentTabId: string;
  strokes: Stroke[];
  userTabs: UserTabInfo[];
  socketId: string;
}
