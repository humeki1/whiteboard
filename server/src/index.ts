import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { randomUUID } from 'crypto';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
  },
});

type Tool = 'pen' | 'eraser' | 'line' | 'rectangle' | 'circle' | 'text';

interface Point { x: number; y: number; }
interface Stroke {
  id: string; tool: Tool; color: string; width: number;
  points: Point[]; userId: string; text?: string;
}
interface Tab { id: string; name: string; strokes: Stroke[]; }
interface RoomUser { userName: string; tabId: string; }
interface Room { tabs: Tab[]; users: Map<string, RoomUser>; }

const rooms = new Map<string, Room>();

function getRoom(roomId: string): Room {
  if (!rooms.has(roomId)) {
    const firstTab: Tab = { id: randomUUID(), name: 'ページ 1', strokes: [] };
    rooms.set(roomId, { tabs: [firstTab], users: new Map() });
  }
  return rooms.get(roomId)!;
}

function tabRoomId(roomId: string, tabId: string) {
  return `${roomId}:${tabId}`;
}

function getUserTabs(room: Room) {
  return Array.from(room.users.entries()).map(([userId, info]) => ({
    userId, userName: info.userName, tabId: info.tabId,
  }));
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

io.on('connection', (socket) => {
  let currentRoomId: string | null = null;
  let currentTabId: string | null = null;

  socket.on('join-room', ({ roomId, userName }: { roomId: string; userName: string }) => {
    if (currentRoomId) {
      socket.leave(currentRoomId);
      if (currentTabId) socket.leave(tabRoomId(currentRoomId, currentTabId));
      const prevRoom = getRoom(currentRoomId);
      prevRoom.users.delete(socket.id);
      io.to(currentRoomId).emit('user-count', prevRoom.users.size);
      io.to(currentRoomId).emit('user-left', socket.id);
    }

    currentRoomId = roomId;
    const room = getRoom(roomId);
    const firstTab = room.tabs[0];
    currentTabId = firstTab.id;

    socket.join(roomId);
    socket.join(tabRoomId(roomId, currentTabId));
    room.users.set(socket.id, { userName, tabId: currentTabId });

    socket.emit('init-room', {
      tabs: room.tabs.map((t) => ({ id: t.id, name: t.name })),
      currentTabId,
      strokes: firstTab.strokes,
      userTabs: getUserTabs(room),
      socketId: socket.id,
    });

    io.to(roomId).emit('user-count', room.users.size);
    socket.to(roomId).emit('user-tab-update', {
      userId: socket.id, userName, tabId: currentTabId,
    });
  });

  socket.on('switch-tab', (tabId: string) => {
    if (!currentRoomId) return;
    const room = getRoom(currentRoomId);
    const tab = room.tabs.find((t) => t.id === tabId);
    if (!tab) return;

    if (currentTabId) {
      socket.to(tabRoomId(currentRoomId, currentTabId)).emit('cursor-leave', socket.id);
      socket.leave(tabRoomId(currentRoomId, currentTabId));
    }
    currentTabId = tabId;
    socket.join(tabRoomId(currentRoomId, currentTabId));

    const userInfo = room.users.get(socket.id);
    if (userInfo) userInfo.tabId = tabId;

    socket.emit('init-tab', tab.strokes);
    io.to(currentRoomId).emit('user-tab-update', {
      userId: socket.id, userName: userInfo?.userName ?? '', tabId,
    });
  });

  socket.on('create-tab', () => {
    if (!currentRoomId) return;
    const room = getRoom(currentRoomId);
    const tab: Tab = {
      id: randomUUID(),
      name: `ページ ${room.tabs.length + 1}`,
      strokes: [],
    };
    room.tabs.push(tab);
    io.to(currentRoomId).emit('tab-created', { id: tab.id, name: tab.name });
  });

  socket.on('stroke', (stroke: Stroke) => {
    if (!currentRoomId || !currentTabId) return;
    const room = getRoom(currentRoomId);
    const tab = room.tabs.find((t) => t.id === currentTabId);
    if (tab) tab.strokes.push(stroke);
    socket.to(tabRoomId(currentRoomId, currentTabId)).emit('stroke', stroke);
  });

  socket.on('clear', () => {
    if (!currentRoomId || !currentTabId) return;
    const room = getRoom(currentRoomId);
    const tab = room.tabs.find((t) => t.id === currentTabId);
    if (tab) tab.strokes = [];
    io.to(tabRoomId(currentRoomId, currentTabId)).emit('clear');
  });

  socket.on('undo', (strokeId: string) => {
    if (!currentRoomId || !currentTabId) return;
    const room = getRoom(currentRoomId);
    const tab = room.tabs.find((t) => t.id === currentTabId);
    if (tab) tab.strokes = tab.strokes.filter((s) => s.id !== strokeId);
    io.to(tabRoomId(currentRoomId, currentTabId)).emit('undo', strokeId);
  });

  socket.on('chat-message', (data: { id: string; userName: string; text: string }) => {
    if (!currentRoomId) return;
    // socket.to (not io.to): excludes sender — client adds message locally to avoid duplicate
    socket.to(currentRoomId).emit('chat-message', { ...data, timestamp: Date.now() });
  });

  socket.on('cursor-move', (data: { x: number; y: number; userName: string }) => {
    if (!currentRoomId || !currentTabId) return;
    socket.to(tabRoomId(currentRoomId, currentTabId)).emit('cursor-move', {
      userId: socket.id, userName: data.userName, x: data.x, y: data.y,
    });
  });

  socket.on('cursor-leave', () => {
    if (!currentRoomId || !currentTabId) return;
    socket.to(tabRoomId(currentRoomId, currentTabId)).emit('cursor-leave', socket.id);
  });

  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = getRoom(currentRoomId);
    room.users.delete(socket.id);
    if (currentTabId) {
      io.to(tabRoomId(currentRoomId, currentTabId)).emit('cursor-leave', socket.id);
    }
    io.to(currentRoomId).emit('user-count', room.users.size);
    io.to(currentRoomId).emit('user-left', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Whiteboard server running on :${PORT}`);
});
