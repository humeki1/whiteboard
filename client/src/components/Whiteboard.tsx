import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { Tool, Point, Stroke, ChatMessage, TabInfo, UserTabInfo, InitRoomData } from '../types';
import Toolbar from './Toolbar';
import TabBar from './TabBar';
import ChatPanel from './ChatPanel';
import { useSocket } from '../hooks/useSocket';

interface Props {
  roomId: string;
  userName: string;
  onLeave: () => void;
}

interface RemoteCursor {
  x: number;
  y: number;
  color: string;
  userName: string;
}

interface TextInput {
  x: number;
  y: number;
  value: string;
}

function userColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return `hsl(${h % 360}, 75%, 48%)`;
}

function renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const { tool, color, width, points } = stroke;
  if (points.length === 0) return;

  ctx.save();
  ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
  ctx.fillStyle   = tool === 'eraser' ? '#ffffff' : color;
  ctx.lineWidth   = width;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  const [first, ...rest] = points;

  if (tool === 'pen' || tool === 'eraser') {
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    if (rest.length === 0) {
      ctx.arc(first.x, first.y, width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      for (let i = 0; i < rest.length - 1; i++) {
        const mid = { x: (rest[i].x + rest[i + 1].x) / 2, y: (rest[i].y + rest[i + 1].y) / 2 };
        ctx.quadraticCurveTo(rest[i].x, rest[i].y, mid.x, mid.y);
      }
      ctx.lineTo(rest[rest.length - 1].x, rest[rest.length - 1].y);
      ctx.stroke();
    }
  } else if (tool === 'line') {
    const last = points[points.length - 1];
    ctx.beginPath(); ctx.moveTo(first.x, first.y); ctx.lineTo(last.x, last.y); ctx.stroke();
  } else if (tool === 'rectangle') {
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.strokeRect(first.x, first.y, last.x - first.x, last.y - first.y);
  } else if (tool === 'circle') {
    const last = points[points.length - 1];
    const rx = Math.abs(last.x - first.x) / 2;
    const ry = Math.abs(last.y - first.y) / 2;
    ctx.beginPath();
    ctx.ellipse((first.x + last.x) / 2, (first.y + last.y) / 2, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (tool === 'text' && stroke.text) {
    const fontSize = Math.max(12, width * 4);
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(stroke.text, first.x, first.y);
  }

  ctx.restore();
}

function getEventPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  const src = 'touches' in e ? e.touches[0] : e;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

export default function Whiteboard({ roomId, userName, onLeave }: Props) {
  const [tool, setTool]           = useState<Tool>('pen');
  const [color, setColor]         = useState('#000000');
  const [width, setWidth]         = useState(4);
  const [userCount, setUserCount] = useState(1);
  const [cursors, setCursors]     = useState<Record<string, RemoteCursor>>({});
  const [chatOpen, setChatOpen]   = useState(false);
  const [unread, setUnread]       = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const [tabs, setTabs]                 = useState<TabInfo[]>([]);
  const [currentTabId, setCurrentTabId] = useState<string>('');
  const [userTabs, setUserTabs]         = useState<UserTabInfo[]>([]);
  const [mySocketId, setMySocketId]     = useState<string>('');

  const textInputStateRef = useRef<TextInput | null>(null);
  const [textInput, setTextInputRaw] = useState<TextInput | null>(null);
  const setTextInput = (val: TextInput | null) => {
    textInputStateRef.current = val;
    setTextInputRaw(val);
  };

  const baseRef    = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const strokesRef     = useRef<Stroke[]>([]);
  const activeStroke   = useRef<Stroke | null>(null);
  const drawing        = useRef(false);
  const startPt        = useRef<Point>({ x: 0, y: 0 });
  const lastCursorSend = useRef(0);
  const userId         = useRef(uuid()).current;

  const toolRef  = useRef(tool);
  const colorRef = useRef(color);
  const widthRef = useRef(width);
  toolRef.current  = tool;
  colorRef.current = color;
  widthRef.current = width;

  const baseCtx    = () => baseRef.current?.getContext('2d') ?? null;
  const overlayCtx = () => overlayRef.current?.getContext('2d') ?? null;

  const redrawBase = useCallback(() => {
    const canvas = baseRef.current;
    const ctx = baseCtx();
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    strokesRef.current.forEach((s) => renderStroke(ctx, s));
  }, []);

  const resizeCanvases = useCallback(() => {
    const base = baseRef.current; const overlay = overlayRef.current;
    if (!base || !overlay) return;
    const { clientWidth: w, clientHeight: h } = base.parentElement!;
    base.width = w; base.height = h; overlay.width = w; overlay.height = h;
    const ctx = baseCtx();
    if (ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
    redrawBase();
  }, [redrawBase]);

  const commitText = useCallback(() => {
    const ti = textInputStateRef.current;
    setTextInput(null);
    if (!ti || !ti.value.trim()) return;
    const stroke: Stroke = {
      id: uuid(), tool: 'text',
      color: colorRef.current, width: widthRef.current,
      points: [{ x: ti.x, y: ti.y }],
      text: ti.value.trim(), userId,
    };
    strokesRef.current.push(stroke);
    const ctx = baseCtx();
    if (ctx) renderStroke(ctx, stroke);
    sendStrokeRef.current(stroke);
  }, [userId]);

  const sendStrokeRef = useRef<(s: Stroke) => void>(() => {});

  const onInitRoom = useCallback((data: InitRoomData) => {
    setMySocketId(data.socketId);
    setTabs(data.tabs);
    setCurrentTabId(data.currentTabId);
    setUserTabs(data.userTabs);
    strokesRef.current = data.strokes;
    redrawBase();
  }, [redrawBase]);

  const onInitTab = useCallback((strokes: Stroke[]) => {
    strokesRef.current = strokes;
    setCursors({});
    redrawBase();
  }, [redrawBase]);

  const onStroke = useCallback((stroke: Stroke) => {
    strokesRef.current.push(stroke);
    const ctx = baseCtx(); if (ctx) renderStroke(ctx, stroke);
  }, []);

  const onClear = useCallback(() => {
    strokesRef.current = []; redrawBase();
  }, [redrawBase]);

  const onUndo = useCallback((strokeId: string) => {
    strokesRef.current = strokesRef.current.filter((s) => s.id !== strokeId); redrawBase();
  }, [redrawBase]);

  const onTabCreated = useCallback((tab: TabInfo) => {
    setTabs((prev) => [...prev, tab]);
  }, []);

  const onUserTabUpdate = useCallback((data: UserTabInfo) => {
    setUserTabs((prev) => [...prev.filter((u) => u.userId !== data.userId), data]);
  }, []);

  const onUserLeft = useCallback((uid: string) => {
    setUserTabs((prev) => prev.filter((u) => u.userId !== uid));
    setCursors((prev) => { const next = { ...prev }; delete next[uid]; return next; });
  }, []);

  const onCursorMove = useCallback(({ userId: uid, userName: uName, x, y }: { userId: string; userName: string; x: number; y: number }) => {
    setCursors((prev) => ({ ...prev, [uid]: { x, y, color: userColor(uid), userName: uName } }));
  }, []);

  const onCursorLeave = useCallback((uid: string) => {
    setCursors((prev) => { const next = { ...prev }; delete next[uid]; return next; });
  }, []);

  const onChatMessage = useCallback((msg: ChatMessage) => {
    setChatMessages((prev) => [...prev, msg]);
    setChatOpen((open) => {
      if (!open) setUnread((n) => n + 1);
      return open;
    });
  }, []);

  const {
    sendStroke, sendClear, sendUndo, sendCursorMove, sendCursorLeave,
    sendChatMessage, sendSwitchTab, sendCreateTab,
  } = useSocket(roomId, userName, {
    onInitRoom, onInitTab, onStroke, onClear, onUndo,
    onUserCount: setUserCount, onTabCreated, onUserTabUpdate,
    onUserLeft, onCursorMove, onCursorLeave, onChatMessage,
  });

  sendStrokeRef.current = sendStroke;

  useEffect(() => {
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);
    return () => window.removeEventListener('resize', resizeCanvases);
  }, [resizeCanvases]);

  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const pos = getEventPos(e, canvas);
      if (textInputStateRef.current) { commitText(); }
      if (toolRef.current === 'text') {
        const fontSize = Math.max(12, widthRef.current * 4);
        setTextInput({ x: pos.x, y: pos.y + fontSize, value: '' });
        return;
      }
      drawing.current = true;
      startPt.current = pos;
      activeStroke.current = {
        id: uuid(), tool: toolRef.current,
        color: colorRef.current, width: widthRef.current,
        points: [pos], userId,
      };
    };

    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const pos = getEventPos(e, canvas);
      const now = Date.now();
      if (now - lastCursorSend.current > 30) {
        lastCursorSend.current = now;
        sendCursorMove({ ...pos, userName });
      }
      if (!drawing.current || !activeStroke.current) return;
      const s = activeStroke.current;
      if (s.tool === 'pen' || s.tool === 'eraser') {
        s.points.push(pos);
      } else {
        s.points = [startPt.current, pos];
      }
      const ctx = overlayCtx();
      if (ctx) { ctx.clearRect(0, 0, canvas.width, canvas.height); renderStroke(ctx, s); }
    };

    const end = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!drawing.current || !activeStroke.current) return;
      drawing.current = false;
      const stroke = activeStroke.current;
      activeStroke.current = null;
      strokesRef.current.push(stroke);
      const bCtx = baseCtx(); if (bCtx) renderStroke(bCtx, stroke);
      const oCtx = overlayCtx(); if (oCtx) oCtx.clearRect(0, 0, canvas.width, canvas.height);
      sendStroke(stroke);
    };

    const leave = () => {
      sendCursorLeave();
      if (drawing.current && activeStroke.current) {
        drawing.current = false;
        const stroke = activeStroke.current; activeStroke.current = null;
        strokesRef.current.push(stroke);
        const bCtx = baseCtx(); if (bCtx) renderStroke(bCtx, stroke);
        const oCtx = overlayCtx(); if (oCtx) oCtx.clearRect(0, 0, canvas.width, canvas.height);
        sendStroke(stroke);
      }
    };

    canvas.addEventListener('mousedown',  start, { passive: false });
    canvas.addEventListener('mousemove',  move,  { passive: false });
    canvas.addEventListener('mouseup',    end,   { passive: false });
    canvas.addEventListener('mouseleave', leave, { passive: false });
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove',  move,  { passive: false });
    canvas.addEventListener('touchend',   end,   { passive: false });

    return () => {
      canvas.removeEventListener('mousedown',  start);
      canvas.removeEventListener('mousemove',  move);
      canvas.removeEventListener('mouseup',    end);
      canvas.removeEventListener('mouseleave', leave);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove',  move);
      canvas.removeEventListener('touchend',   end);
    };
  }, [sendStroke, sendCursorMove, sendCursorLeave, commitText, userId, userName]);

  const handleUndo = useCallback(() => {
    const mine = strokesRef.current.filter((s) => s.userId === userId);
    if (mine.length === 0) return;
    const last = mine[mine.length - 1];
    strokesRef.current = strokesRef.current.filter((s) => s.id !== last.id);
    redrawBase(); sendUndo(last.id);
  }, [redrawBase, sendUndo, userId]);

  const handleClear = useCallback(() => {
    if (!confirm('このページを全消去しますか？')) return;
    sendClear();
  }, [sendClear]);

  const handleExport = useCallback(() => {
    const base = baseRef.current; const overlay = overlayRef.current;
    if (!base || !overlay) return;
    const merged = document.createElement('canvas');
    merged.width = base.width; merged.height = base.height;
    const ctx = merged.getContext('2d')!;
    ctx.drawImage(base, 0, 0); ctx.drawImage(overlay, 0, 0);
    const link = document.createElement('a');
    link.download = `whiteboard-${roomId}.png`;
    link.href = merged.toDataURL('image/png'); link.click();
  }, [roomId]);

  const handleChatToggle = () => {
    setChatOpen((v) => !v);
    setUnread(0);
  };

  const handleSendChat = useCallback((text: string) => {
    const id = uuid();
    const localMsg: ChatMessage = { id, userName, text, timestamp: Date.now() };
    setChatMessages((prev) => [...prev, localMsg]);
    sendChatMessage({ id, userName, text });
  }, [userName, sendChatMessage]);

  const handleSwitchTab = useCallback((tabId: string) => {
    setCurrentTabId(tabId);
    strokesRef.current = [];
    setCursors({});
    redrawBase();
    sendSwitchTab(tabId);
  }, [redrawBase, sendSwitchTab]);

  const handleCreateTab = useCallback(() => {
    sendCreateTab();
  }, [sendCreateTab]);

  const cursor = tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair';
  const fontSize = Math.max(12, width * 4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <Toolbar
        tool={tool} color={color} width={width} userCount={userCount}
        roomId={roomId} chatOpen={chatOpen} unreadCount={unread}
        onToolChange={setTool} onColorChange={setColor} onWidthChange={setWidth}
        onClear={handleClear} onUndo={handleUndo} onExport={handleExport}
        onChatToggle={handleChatToggle} onLeave={onLeave}
      />
      <TabBar
        tabs={tabs}
        currentTabId={currentTabId}
        userTabs={userTabs}
        mySocketId={mySocketId}
        onSwitch={handleSwitchTab}
        onCreate={handleCreateTab}
      />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
        <canvas ref={baseRef}    style={{ position: 'absolute', inset: 0 }} />
        <canvas ref={overlayRef} style={{ position: 'absolute', inset: 0, cursor }} />

        {textInput && (
          <input
            autoFocus
            value={textInput.value}
            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitText(); }
              if (e.key === 'Escape') { setTextInput(null); }
            }}
            onBlur={commitText}
            style={{
              position: 'absolute',
              left: textInput.x,
              top: textInput.y - fontSize,
              fontSize,
              fontFamily: 'system-ui, sans-serif',
              color: color,
              background: 'transparent',
              border: '1px dashed #94a3b8',
              outline: 'none',
              minWidth: 120,
              zIndex: 25,
              padding: '0 2px',
            }}
          />
        )}

        {Object.entries(cursors).map(([uid, cur]) => (
          <div key={uid} style={{ position: 'absolute', left: cur.x, top: cur.y, pointerEvents: 'none', zIndex: 20 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" style={{ display: 'block' }}>
              <path d="M4 2 L4 16 L7.5 12.5 L10.5 18.5 L12.5 17.5 L9.5 11 L14 11 Z"
                fill={cur.color} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span style={{
              display: 'inline-block', background: cur.color, color: '#fff',
              fontSize: 11, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
              marginTop: 2, whiteSpace: 'nowrap', fontFamily: 'system-ui, sans-serif',
            }}>
              {cur.userName}
            </span>
          </div>
        ))}

        {chatOpen && (
          <ChatPanel
            messages={chatMessages}
            userName={userName}
            onSend={handleSendChat}
            onClose={handleChatToggle}
          />
        )}
      </div>
    </div>
  );
}
