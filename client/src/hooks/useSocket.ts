import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Stroke } from '../types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

type Callbacks = {
  onInit: (strokes: Stroke[]) => void;
  onStroke: (stroke: Stroke) => void;
  onClear: () => void;
  onUndo: (strokeId: string) => void;
  onUserCount: (count: number) => void;
  onCursorMove: (data: { userId: string; x: number; y: number }) => void;
  onCursorLeave: (userId: string) => void;
};

export function useSocket(roomId: string, callbacks: Callbacks) {
  const socketRef = useRef<Socket | null>(null);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.emit('join-room', roomId);
    socket.on('init',         (data: Stroke[]) => cbRef.current.onInit(data));
    socket.on('stroke',       (data: Stroke)   => cbRef.current.onStroke(data));
    socket.on('clear',        ()               => cbRef.current.onClear());
    socket.on('undo',         (id: string)     => cbRef.current.onUndo(id));
    socket.on('user-count',   (n: number)      => cbRef.current.onUserCount(n));
    socket.on('cursor-move',  (data: { userId: string; x: number; y: number }) => cbRef.current.onCursorMove(data));
    socket.on('cursor-leave', (id: string)     => cbRef.current.onCursorLeave(id));

    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  const sendStroke = useCallback((stroke: Stroke) => {
    socketRef.current?.emit('stroke', stroke);
  }, []);

  const sendClear = useCallback(() => {
    socketRef.current?.emit('clear');
  }, []);

  const sendUndo = useCallback((strokeId: string) => {
    socketRef.current?.emit('undo', strokeId);
  }, []);

  const sendCursorMove = useCallback((pos: { x: number; y: number }) => {
    socketRef.current?.emit('cursor-move', pos);
  }, []);

  const sendCursorLeave = useCallback(() => {
    socketRef.current?.emit('cursor-leave');
  }, []);

  return { sendStroke, sendClear, sendUndo, sendCursorMove, sendCursorLeave };
}
