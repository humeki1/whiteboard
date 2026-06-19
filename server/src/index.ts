import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
  },
});

type Tool = 'pen' | 'eraser' | 'line' | 'rectangle' | 'circle';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  id: string;
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
  userId: string;
}

interface Room {
  strokes: Stroke[];
  users: Set<string>;
}

const rooms = new Map<string, Room>();

function getRoom(roomId: string): Room {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { strokes: [], users: new Set() });
  }
  return rooms.get(roomId)!;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

io.on('connection', (socket) => {
  let currentRoom: string | null = null;

  socket.on('join-room', (roomId: string) => {
    if (currentRoom) {
      socket.leave(currentRoom);
      getRoom(currentRoom).users.delete(socket.id);
      io.to(currentRoom).emit('user-count', getRoom(currentRoom).users.size);
    }

    currentRoom = roomId;
    socket.join(roomId);
    const room = getRoom(roomId);
    room.users.add(socket.id);

    socket.emit('init', room.strokes);
    io.to(roomId).emit('user-count', room.users.size);
  });

  socket.on('stroke', (stroke: Stroke) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.strokes.push(stroke);
    socket.to(currentRoom).emit('stroke', stroke);
  });

  socket.on('clear', () => {
    if (!currentRoom) return;
    getRoom(currentRoom).strokes = [];
    io.to(currentRoom).emit('clear');
  });

  socket.on('undo', (strokeId: string) => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.strokes = room.strokes.filter((s) => s.id !== strokeId);
    io.to(currentRoom).emit('undo', strokeId);
  });

  socket.on('cursor-move', (data: { x: number; y: number; userName: string }) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('cursor-move', { userId: socket.id, userName: data.userName, x: data.x, y: data.y });
  });

  socket.on('cursor-leave', () => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('cursor-leave', socket.id);
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.users.delete(socket.id);
    io.to(currentRoom).emit('user-count', room.users.size);
    io.to(currentRoom).emit('cursor-leave', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Whiteboard server running on :${PORT}`);
});
