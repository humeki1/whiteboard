import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Stroke, ChatMessage, TabInfo, UserTabInfo, InitRoomData } from '../types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

type Callbacks = {
  onInitRoom: (data: InitRoomData) => void;
  onInitTab: (strokes: Stroke[]) => void;
  onStroke: (stroke: Stroke) => void;
  onClear: () => void;
  onUndo: (strokeId: string) => void;
  onUserCount: (count: number) => void;
  onTabCreated: (tab: TabInfo) => void;
  onUserTabUpdate: (data: UserTabInfo) => void;
  onUserLeft: (userId: string) => void;
  onCursorMove: (data: { userId: string; userName: string; x: number; y: number }) => void;
  onCursorLeave: (userId: string) => void;
  onChatMessage: (msg: ChatMessage) => void;
};

export function useSocket(roomId: string, userName: string, callbacks: Callbacks) {
  const socketRef = useRef<Socket | null>(null);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.emit('join-room', { roomId, userName });
    socket.on('init-room',       (data: InitRoomData)         => cbRef.current.onInitRoom(data));
    socket.on('init-tab',        (strokes: Stroke[])          => cbRef.current.onInitTab(strokes));
    socket.on('stroke',          (data: Stroke)               => cbRef.current.onStroke(data));
    socket.on('clear',           ()                           => cbRef.current.onClear());
    socket.on('undo',            (id: string)                 => cbRef.current.onUndo(id));
    socket.on('user-count',      (n: number)                  => cbRef.current.onUserCount(n));
    socket.on('tab-created',     (tab: TabInfo)               => cbRef.current.onTabCreated(tab));
    socket.on('user-tab-update', (data: UserTabInfo)          => cbRef.current.onUserTabUpdate(data));
    socket.on('user-left',       (userId: string)             => cbRef.current.onUserLeft(userId));
    socket.on('cursor-move',     (data: { userId: string; userName: string; x: number; y: number }) => cbRef.current.onCursorMove(data));
    socket.on('cursor-leave',    (id: string)                 => cbRef.current.onCursorLeave(id));
    socket.on('chat-message',    (msg: ChatMessage)           => cbRef.current.onChatMessage(msg));

    return () => { socket.disconnect(); };
  }, [roomId, userName]);

  const sendStroke = useCallback((stroke: Stroke) => {
    socketRef.current?.emit('stroke', stroke);
  }, []);

  const sendClear = useCallback(() => {
    socketRef.current?.emit('clear');
  }, []);

  const sendUndo = useCallback((strokeId: string) => {
    socketRef.current?.emit('undo', strokeId);
  }, []);

  const sendCursorMove = useCallback((pos: { x: number; y: number; userName: string }) => {
    socketRef.current?.emit('cursor-move', pos);
  }, []);

  const sendCursorLeave = useCallback(() => {
    socketRef.current?.emit('cursor-leave');
  }, []);

  const sendChatMessage = useCallback((msg: { id: string; userName: string; text: string }) => {
    socketRef.current?.emit('chat-message', msg);
  }, []);

  const sendSwitchTab = useCallback((tabId: string) => {
    socketRef.current?.emit('switch-tab', tabId);
  }, []);

  const sendCreateTab = useCallback(() => {
    socketRef.current?.emit('create-tab');
  }, []);

  return { sendStroke, sendClear, sendUndo, sendCursorMove, sendCursorLeave, sendChatMessage, sendSwitchTab, sendCreateTab };
}
