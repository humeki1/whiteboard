import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { Tool, Point, Stroke, ChatMessage, TabInfo, UserTabInfo, InitRoomData } from '../types';
import Toolbar from './Toolbar';
import TabBar from './TabBar';
import ChatPanel from './ChatPanel';
import { useSocket } from '../hooks/useSocket';

interface Props { roomId: string; userName: string; onLeave: () => void; }
interface RemoteCursor { x: number; y: number; color: string; userName: string; }
interface TextInputState { x: number; y: number; value: string; }
type SelectMode = 'idle' | 'selecting' | 'selected' | 'moving' | 'resizing';
type UndoEntry =
  | { type: 'stroke'; id: string }
  | { type: 'move'; ids: string[]; dx: number; dy: number }
  | { type: 'resize'; origStrokes: Array<{ id: string; points: Point[]; width: number }> };

function userColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return `hsl(${h % 360}, 75%, 48%)`;
}

const SEL_PAD = 6;
const RESIZE_HIT = 8;
const RESIZE_HANDLE_SIZE = 10;
const RESIZE_CURSOR: Record<string, string> = { nw: 'nw-resize', ne: 'ne-resize', sw: 'sw-resize', se: 'se-resize' };
type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';
type Bbox = { minX: number; minY: number; maxX: number; maxY: number };

function drawResizeHandles(ctx: CanvasRenderingContext2D, b: Bbox) {
  const H = RESIZE_HANDLE_SIZE / 2;
  const corners = [
    { x: b.minX - SEL_PAD, y: b.minY - SEL_PAD },
    { x: b.maxX + SEL_PAD, y: b.minY - SEL_PAD },
    { x: b.minX - SEL_PAD, y: b.maxY + SEL_PAD },
    { x: b.maxX + SEL_PAD, y: b.maxY + SEL_PAD },
  ];
  ctx.save();
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5;
  corners.forEach(c => {
    ctx.beginPath(); ctx.rect(c.x - H, c.y - H, RESIZE_HANDLE_SIZE, RESIZE_HANDLE_SIZE);
    ctx.fill(); ctx.stroke();
  });
  ctx.restore();
}

function getResizeHandle(b: Bbox, pos: Point): ResizeHandle | null {
  const corners: Array<[ResizeHandle, number, number]> = [
    ['nw', b.minX - SEL_PAD, b.minY - SEL_PAD],
    ['ne', b.maxX + SEL_PAD, b.minY - SEL_PAD],
    ['sw', b.minX - SEL_PAD, b.maxY + SEL_PAD],
    ['se', b.maxX + SEL_PAD, b.maxY + SEL_PAD],
  ];
  for (const [id, cx, cy] of corners) {
    if (Math.abs(pos.x - cx) <= RESIZE_HIT && Math.abs(pos.y - cy) <= RESIZE_HIT) return id;
  }
  return null;
}

function computeResizeBbox(orig: Bbox, handle: ResizeHandle, pos: Point): Bbox {
  const P = SEL_PAD, MIN = 20;
  let minX: number, minY: number, maxX: number, maxY: number;
  if      (handle === 'nw') { minX = pos.x + P; minY = pos.y + P; maxX = orig.maxX;   maxY = orig.maxY; }
  else if (handle === 'ne') { minX = orig.minX;  minY = pos.y + P; maxX = pos.x - P;   maxY = orig.maxY; }
  else if (handle === 'sw') { minX = pos.x + P;  minY = orig.minY; maxX = orig.maxX;   maxY = pos.y - P; }
  else                      { minX = orig.minX;  minY = orig.minY; maxX = pos.x - P;   maxY = pos.y - P; }
  if (maxX - minX < MIN) { if (handle === 'nw' || handle === 'sw') minX = maxX - MIN; else maxX = minX + MIN; }
  if (maxY - minY < MIN) { if (handle === 'nw' || handle === 'ne') minY = maxY - MIN; else maxY = minY + MIN; }
  return { minX, minY, maxX, maxY };
}

function scalePoint(p: Point, orig: Bbox, next: Bbox): Point {
  const ow = orig.maxX - orig.minX, oh = orig.maxY - orig.minY;
  const nw = next.maxX - next.minX, nh = next.maxY - next.minY;
  return {
    x: ow < 1 ? next.minX : next.minX + (p.x - orig.minX) / ow * nw,
    y: oh < 1 ? next.minY : next.minY + (p.y - orig.minY) / oh * nh,
  };
}

function scaleStroke(s: Stroke, orig: Bbox, next: Bbox): Stroke {
  if (s.tool === 'image' && s.points.length >= 2) {
    const newPos = scalePoint(s.points[0], orig, next);
    const br = scalePoint({ x: s.points[0].x + s.points[1].x, y: s.points[0].y + s.points[1].y }, orig, next);
    return { ...s, points: [newPos, { x: Math.max(10, br.x - newPos.x), y: Math.max(10, br.y - newPos.y) }] };
  }
  if (s.tool === 'text') {
    const oh = orig.maxY - orig.minY, nh = next.maxY - next.minY;
    const ratio = oh < 1 ? 1 : nh / oh;
    return { ...s, points: [scalePoint(s.points[0], orig, next)], width: Math.max(1, Math.round(s.width * ratio)) };
  }
  return { ...s, points: s.points.map(p => scalePoint(p, orig, next)) };
}

function compressImageFile(file: File, maxW = 900, maxH = 700): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > maxW || h > maxH) { const r = Math.min(maxW / w, maxH / h); w = Math.round(w * r); h = Math.round(h * r); }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.src = url;
  });
}

function getStrokeBbox(s: Stroke): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (s.points.length === 0) return null;
  if (s.tool === 'image' && s.points.length >= 2) {
    const [pos, dim] = s.points;
    return { minX: pos.x, minY: pos.y, maxX: pos.x + dim.x, maxY: pos.y + dim.y };
  }
  if (s.tool === 'text' && s.text) {
    const fs = Math.max(12, s.width * 4);
    const lines = s.text.split('\n');
    const p = s.points[0];
    return { minX: p.x - 2, minY: p.y - fs - 2, maxX: p.x + Math.max(...lines.map(l => l.length)) * fs * 0.62 + 2, maxY: p.y + (lines.length - 1) * fs * 1.3 + 2 };
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of s.points) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const pad = s.width / 2 + 2;
  return { minX: x0 - pad, minY: y0 - pad, maxX: x1 + pad, maxY: y1 + pad };
}

function getStrokesBbox(strokes: Stroke[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    const b = getStrokeBbox(s);
    if (b) { x0 = Math.min(x0, b.minX); y0 = Math.min(y0, b.minY); x1 = Math.max(x1, b.maxX); y1 = Math.max(y1, b.maxY); }
  }
  return isFinite(x0) ? { minX: x0, minY: y0, maxX: x1, maxY: y1 } : null;
}

function bboxContains(b: ReturnType<typeof getStrokesBbox>, p: Point) {
  return b != null && p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

function strokeInRect(s: Stroke, rx: number, ry: number, rw: number, rh: number) {
  const b = getStrokeBbox(s);
  if (!b) return false;
  const x1 = Math.min(rx, rx + rw), x2 = Math.max(rx, rx + rw);
  const y1 = Math.min(ry, ry + rh), y2 = Math.max(ry, ry + rh);
  return b.maxX >= x1 && b.minX <= x2 && b.maxY >= y1 && b.minY <= y2;
}

function drawSelBox(ctx: CanvasRenderingContext2D, b: NonNullable<ReturnType<typeof getStrokesBbox>>) {
  const p = SEL_PAD;
  ctx.save();
  ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.fillStyle = 'rgba(37,99,235,0.04)';
  ctx.fillRect(b.minX - p, b.minY - p, b.maxX - b.minX + p * 2, b.maxY - b.minY + p * 2);
  ctx.strokeRect(b.minX - p, b.minY - p, b.maxX - b.minX + p * 2, b.maxY - b.minY + p * 2);
  ctx.setLineDash([]); ctx.restore();
}

function renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, cache?: Map<string, HTMLImageElement>) {
  const { tool, color, width, points } = stroke;
  if (points.length === 0) return;
  if (tool === 'image') {
    const img = cache?.get(stroke.id);
    if (img && points.length >= 2) ctx.drawImage(img, points[0].x, points[0].y, points[1].x, points[1].y);
    return;
  }
  ctx.save();
  ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
  ctx.fillStyle   = tool === 'eraser' ? '#ffffff' : color;
  ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const [first, ...rest] = points;
  if (tool === 'pen' || tool === 'eraser') {
    ctx.beginPath(); ctx.moveTo(first.x, first.y);
    if (rest.length === 0) { ctx.arc(first.x, first.y, width / 2, 0, Math.PI * 2); ctx.fill(); }
    else {
      for (let i = 0; i < rest.length - 1; i++) {
        const mid = { x: (rest[i].x + rest[i+1].x)/2, y: (rest[i].y + rest[i+1].y)/2 };
        ctx.quadraticCurveTo(rest[i].x, rest[i].y, mid.x, mid.y);
      }
      ctx.lineTo(rest[rest.length-1].x, rest[rest.length-1].y); ctx.stroke();
    }
  } else if (tool === 'line') {
    const last = points[points.length-1];
    ctx.beginPath(); ctx.moveTo(first.x, first.y); ctx.lineTo(last.x, last.y); ctx.stroke();
  } else if (tool === 'rectangle') {
    const last = points[points.length-1];
    ctx.beginPath(); ctx.strokeRect(first.x, first.y, last.x-first.x, last.y-first.y);
  } else if (tool === 'circle') {
    const last = points[points.length-1];
    ctx.beginPath();
    ctx.ellipse((first.x+last.x)/2, (first.y+last.y)/2, Math.max(Math.abs(last.x-first.x)/2,1), Math.max(Math.abs(last.y-first.y)/2,1), 0, 0, Math.PI*2);
    ctx.stroke();
  } else if (tool === 'text' && stroke.text) {
    const fontSize = Math.max(12, width * 4);
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    stroke.text.split('\n').forEach((line, i) => ctx.fillText(line, first.x, first.y + i * fontSize * 1.3));
  }
  ctx.restore();
}

function getEventPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  const src = 'touches' in e ? e.touches[0] : e;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

export default function Whiteboard({ roomId, userName, onLeave }: Props) {
  const [tool, setTool]     = useState<Tool>('pen');
  const [color, setColor]   = useState('#000000');
  const [width, setWidth]   = useState(4);
  const [userCount, setUserCount] = useState(1);
  const [cursors, setCursors]     = useState<Record<string, RemoteCursor>>({});
  const [chatOpen, setChatOpen]   = useState(false);
  const [unread, setUnread]       = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Tab state
  const [tabs, setTabs]                 = useState<TabInfo[]>([]);
  const [currentTabId, setCurrentTabId] = useState('');
  const [userTabs, setUserTabs]         = useState<UserTabInfo[]>([]);
  const [mySocketId, setMySocketId]     = useState('');

  // Text overlay
  const textStateRef = useRef<TextInputState | null>(null);
  const [textInput, setTextInputRaw] = useState<TextInputState | null>(null);
  const setTextInput = (v: TextInputState | null) => { textStateRef.current = v; setTextInputRaw(v); };

  // Selection state (refs for event handlers, state for rendering)
  const [selectMode, setSelectMode]     = useState<SelectMode>('idle');
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const selectModeRef  = useRef<SelectMode>('idle');
  const selectedIdsRef = useRef<Set<string>>(new Set());
  const selStartRef    = useRef<Point>({ x: 0, y: 0 });
  const moveStartRef   = useRef<Point>({ x: 0, y: 0 });
  const preMoveRef     = useRef<ImageData | null>(null);
  const undoStackRef   = useRef<UndoEntry[]>([]);
  const imageCacheRef  = useRef<Map<string, HTMLImageElement>>(new Map());
  const resizeHandleRef      = useRef<ResizeHandle>('se');
  const resizeOrigBboxRef    = useRef<Bbox | null>(null);
  const resizeOrigStrokesRef = useRef<Stroke[]>([]);
  const [resizeCursor, setResizeCursor] = useState('crosshair');
  const resizeCursorRef = useRef('crosshair');

  const setSelMode = useCallback((m: SelectMode) => { selectModeRef.current = m; setSelectMode(m); }, []);
  const setSelected = useCallback((ids: Set<string>) => { selectedIdsRef.current = ids; setSelectedIds(ids); }, []);

  const baseRef    = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const strokesRef   = useRef<Stroke[]>([]);
  const activeStroke = useRef<Stroke | null>(null);
  const drawing      = useRef(false);
  const startPt      = useRef<Point>({ x: 0, y: 0 });
  const cursorTimer  = useRef(0);
  const userId       = useRef(uuid()).current;

  const toolRef  = useRef(tool);  toolRef.current  = tool;
  const colorRef = useRef(color); colorRef.current = color;
  const widthRef = useRef(width); widthRef.current = width;

  const baseCtx    = () => baseRef.current?.getContext('2d') ?? null;
  const overlayCtx = () => overlayRef.current?.getContext('2d') ?? null;

  const redrawBase = useCallback((skipIds?: ReadonlySet<string>) => {
    const canvas = baseRef.current; const ctx = baseCtx();
    if (!canvas || !ctx) return;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    strokesRef.current.forEach(s => { if (!skipIds?.has(s.id)) renderStroke(ctx, s, imageCacheRef.current); });
  }, []);

  const showSelOverlay = useCallback(() => {
    const overlay = overlayRef.current; const oCtx = overlayCtx();
    if (!oCtx || !overlay) return;
    oCtx.clearRect(0, 0, overlay.width, overlay.height);
    if (selectedIdsRef.current.size > 0) {
      const bb = getStrokesBbox(strokesRef.current.filter(s => selectedIdsRef.current.has(s.id)));
      if (bb) { drawSelBox(oCtx, bb); drawResizeHandles(oCtx, bb); }
    }
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

  const sendStrokeRef        = useRef<(s: Stroke) => void>(() => {});
  const sendMoveStrokesRef   = useRef<(d: { ids: string[]; dx: number; dy: number }) => void>(() => {});
  const sendSwitchTabRef     = useRef<(id: string) => void>(() => {});
  const sendResizeStrokesRef = useRef<(u: Array<{ id: string; points: Point[]; width: number }>) => void>(() => {});

  const loadImages = useCallback((strokes: Stroke[]) => {
    const uncached = strokes.filter(s => s.tool === 'image' && s.imageData && !imageCacheRef.current.has(s.id));
    if (uncached.length === 0) return;
    let done = 0;
    uncached.forEach(s => {
      const img = new Image();
      img.onload = () => {
        imageCacheRef.current.set(s.id, img);
        done++;
        if (done === uncached.length) redrawBase();
      };
      img.src = s.imageData!;
    });
  }, [redrawBase]);

  const commitText = useCallback(() => {
    const ti = textStateRef.current;
    setTextInput(null);
    if (!ti || !ti.value.trim()) return;
    const stroke: Stroke = {
      id: uuid(), tool: 'text', color: colorRef.current, width: widthRef.current,
      points: [{ x: ti.x, y: ti.y }], text: ti.value.trim(), userId,
    };
    strokesRef.current.push(stroke);
    const ctx = baseCtx(); if (ctx) renderStroke(ctx, stroke, imageCacheRef.current);
    sendStrokeRef.current(stroke);
    undoStackRef.current.push({ type: 'stroke', id: stroke.id });
  }, [userId]);

  // Socket callbacks
  const onInitRoom = useCallback((data: InitRoomData) => {
    setMySocketId(data.socketId); setTabs(data.tabs); setCurrentTabId(data.currentTabId);
    setUserTabs(data.userTabs); setSelected(new Set()); setSelMode('idle');
    strokesRef.current = data.strokes; undoStackRef.current = []; redrawBase();
    loadImages(data.strokes);
  }, [redrawBase, loadImages, setSelected, setSelMode]);

  const onInitTab = useCallback((strokes: Stroke[]) => {
    setSelected(new Set()); setSelMode('idle');
    strokesRef.current = strokes; undoStackRef.current = []; setCursors({});
    const oCtx = overlayCtx(); const ov = overlayRef.current;
    if (oCtx && ov) oCtx.clearRect(0, 0, ov.width, ov.height);
    redrawBase();
    loadImages(strokes);
  }, [redrawBase, loadImages, setSelected, setSelMode]);

  const onStroke = useCallback((stroke: Stroke) => {
    strokesRef.current.push(stroke);
    if (stroke.tool === 'image') {
      loadImages([stroke]);
    } else {
      const ctx = baseCtx(); if (ctx) renderStroke(ctx, stroke, imageCacheRef.current);
    }
  }, [loadImages]);

  const onClear = useCallback(() => {
    setSelected(new Set()); setSelMode('idle');
    strokesRef.current = []; undoStackRef.current = []; redrawBase();
  }, [redrawBase, setSelected, setSelMode]);

  const onUndo = useCallback((strokeId: string) => {
    strokesRef.current = strokesRef.current.filter(s => s.id !== strokeId);
    if (selectedIdsRef.current.has(strokeId)) {
      const next = new Set(selectedIdsRef.current); next.delete(strokeId); setSelected(next);
    }
    redrawBase();
    requestAnimationFrame(showSelOverlay);
  }, [redrawBase, setSelected, showSelOverlay]);

  const onMoveStrokes = useCallback((data: { ids: string[]; dx: number; dy: number }) => {
    const idsSet = new Set(data.ids);
    strokesRef.current = strokesRef.current.map(s => {
      if (!idsSet.has(s.id)) return s;
      if (s.tool === 'image') return { ...s, points: [{ x: s.points[0].x + data.dx, y: s.points[0].y + data.dy }, s.points[1]] };
      return { ...s, points: s.points.map(p => ({ x: p.x + data.dx, y: p.y + data.dy })) };
    });
    redrawBase();
  }, [redrawBase]);

  const onResizeStrokes = useCallback((updates: Array<{ id: string; points: Point[]; width: number }>) => {
    const updMap = new Map(updates.map(u => [u.id, u]));
    strokesRef.current = strokesRef.current.map(s => {
      const upd = updMap.get(s.id);
      return upd ? { ...s, points: upd.points, width: upd.width } : s;
    });
    redrawBase();
    requestAnimationFrame(showSelOverlay);
  }, [redrawBase, showSelOverlay]);

  const onTabCreated = useCallback((tab: TabInfo) => { setTabs(prev => [...prev, tab]); }, []);

  const onTabDeleted = useCallback((deletedTabId: string) => {
    setTabs(prev => prev.filter(t => t.id !== deletedTabId));
    if (currentTabId === deletedTabId) {
      const remaining = tabs.filter(t => t.id !== deletedTabId);
      if (remaining.length > 0) {
        const next = remaining[0];
        setCurrentTabId(next.id); setSelected(new Set()); setSelMode('idle');
        strokesRef.current = []; setCursors({}); redrawBase();
        sendSwitchTabRef.current(next.id);
      }
    }
  }, [currentTabId, tabs, redrawBase, setSelected, setSelMode]);

  const onUserTabUpdate = useCallback((data: UserTabInfo) => {
    setUserTabs(prev => [...prev.filter(u => u.userId !== data.userId), data]);
  }, []);

  const onUserLeft = useCallback((uid: string) => {
    setUserTabs(prev => prev.filter(u => u.userId !== uid));
    setCursors(prev => { const next = { ...prev }; delete next[uid]; return next; });
  }, []);

  const onCursorMove = useCallback(({ userId: uid, userName: uName, x, y }: { userId: string; userName: string; x: number; y: number }) => {
    setCursors(prev => ({ ...prev, [uid]: { x, y, color: userColor(uid), userName: uName } }));
  }, []);

  const onCursorLeave = useCallback((uid: string) => {
    setCursors(prev => { const next = { ...prev }; delete next[uid]; return next; });
  }, []);

  const onChatMessage = useCallback((msg: ChatMessage) => {
    setChatMessages(prev => [...prev, msg]);
    setChatOpen(open => { if (!open) setUnread(n => n + 1); return open; });
  }, []);

  const {
    sendStroke, sendClear, sendUndo, sendCursorMove, sendCursorLeave,
    sendChatMessage, sendSwitchTab, sendCreateTab, sendDeleteTab, sendMoveStrokes, sendResizeStrokes,
  } = useSocket(roomId, userName, {
    onInitRoom, onInitTab, onStroke, onClear, onUndo, onMoveStrokes, onResizeStrokes,
    onUserCount: setUserCount, onTabCreated, onTabDeleted, onUserTabUpdate,
    onUserLeft, onCursorMove, onCursorLeave, onChatMessage,
  });

  sendStrokeRef.current        = sendStroke;
  sendMoveStrokesRef.current   = sendMoveStrokes;
  sendSwitchTabRef.current     = sendSwitchTab;
  sendResizeStrokesRef.current = sendResizeStrokes;

  useEffect(() => {
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);
    return () => window.removeEventListener('resize', resizeCanvases);
  }, [resizeCanvases]);

  // Clear selection when switching away from select tool
  useEffect(() => {
    if (tool !== 'select') {
      selectedIdsRef.current = new Set(); setSelectedIds(new Set());
      selectModeRef.current = 'idle'; setSelectMode('idle');
      const oCtx = overlayCtx(); const ov = overlayRef.current;
      if (oCtx && ov) oCtx.clearRect(0, 0, ov.width, ov.height);
    }
  }, [tool]);

  // Escape key: cancel text or deselect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (textStateRef.current) { setTextInput(null); return; }
      if (selectModeRef.current !== 'idle') {
        setSelected(new Set()); setSelMode('idle');
        const oCtx = overlayCtx(); const ov = overlayRef.current;
        if (oCtx && ov) oCtx.clearRect(0, 0, ov.width, ov.height);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setSelected, setSelMode]);

  // Canvas event handlers
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const pos = getEventPos(e, canvas);
      if (textStateRef.current) commitText();

      if (toolRef.current === 'select') {
        if (selectModeRef.current === 'selected') {
          const selStrokes = strokesRef.current.filter(s => selectedIdsRef.current.has(s.id));
          const bb = getStrokesBbox(selStrokes);
          if (bb) {
            const handle = getResizeHandle(bb, pos);
            if (handle) {
              // Start resize: snapshot base without selected strokes
              selectModeRef.current = 'resizing'; setSelectMode('resizing');
              resizeHandleRef.current = handle;
              resizeOrigBboxRef.current = bb;
              resizeOrigStrokesRef.current = selStrokes;
              const newCur = RESIZE_CURSOR[handle];
              resizeCursorRef.current = newCur; setResizeCursor(newCur);
              const bCtx = baseCtx(); const bCanvas = baseRef.current;
              if (bCtx && bCanvas) {
                bCtx.fillStyle = '#ffffff'; bCtx.fillRect(0, 0, bCanvas.width, bCanvas.height);
                strokesRef.current.filter(s => !selectedIdsRef.current.has(s.id)).forEach(s => renderStroke(bCtx, s, imageCacheRef.current));
                preMoveRef.current = bCtx.getImageData(0, 0, bCanvas.width, bCanvas.height);
              }
              return;
            }
            if (bboxContains(bb, pos)) {
              // Start move: snapshot base without selected strokes
              selectModeRef.current = 'moving'; setSelectMode('moving');
              moveStartRef.current = pos;
              const bCtx = baseCtx(); const bCanvas = baseRef.current;
              if (bCtx && bCanvas) {
                bCtx.fillStyle = '#ffffff'; bCtx.fillRect(0, 0, bCanvas.width, bCanvas.height);
                strokesRef.current.filter(s => !selectedIdsRef.current.has(s.id)).forEach(s => renderStroke(bCtx, s, imageCacheRef.current));
                preMoveRef.current = bCtx.getImageData(0, 0, bCanvas.width, bCanvas.height);
              }
              return;
            }
          }
        }
        // Start new selection rect
        selectModeRef.current = 'selecting'; setSelectMode('selecting');
        setSelected(new Set()); selStartRef.current = pos;
        const oCtx = overlayCtx(); if (oCtx) oCtx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      if (toolRef.current === 'text') {
        const fs = Math.max(12, widthRef.current * 4);
        setTextInput({ x: pos.x, y: pos.y + fs, value: '' });
        return;
      }

      drawing.current = true; startPt.current = pos;
      activeStroke.current = { id: uuid(), tool: toolRef.current, color: colorRef.current, width: widthRef.current, points: [pos], userId };
    };

    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const pos = getEventPos(e, canvas);
      const now = Date.now();
      if (now - cursorTimer.current > 30) { cursorTimer.current = now; sendCursorMove({ ...pos, userName }); }

      if (toolRef.current === 'select') {
        if (selectModeRef.current === 'selecting') {
          const oCtx = overlayCtx();
          if (oCtx) {
            oCtx.clearRect(0, 0, canvas.width, canvas.height);
            const rx = selStartRef.current.x, ry = selStartRef.current.y;
            const rw = pos.x - rx, rh = pos.y - ry;
            oCtx.save(); oCtx.strokeStyle = '#2563eb'; oCtx.lineWidth = 1;
            oCtx.setLineDash([4, 3]); oCtx.fillStyle = 'rgba(37,99,235,0.05)';
            oCtx.fillRect(rx, ry, rw, rh); oCtx.strokeRect(rx, ry, rw, rh);
            oCtx.setLineDash([]); oCtx.restore();
          }
        } else if (selectModeRef.current === 'moving') {
          const dx = pos.x - moveStartRef.current.x;
          const dy = pos.y - moveStartRef.current.y;
          const bCtx = baseCtx();
          if (bCtx && preMoveRef.current) bCtx.putImageData(preMoveRef.current, 0, 0);
          const oCtx = overlayCtx(); const ov = overlayRef.current;
          if (oCtx && ov) {
            oCtx.clearRect(0, 0, ov.width, ov.height);
            const moved = strokesRef.current.filter(s => selectedIdsRef.current.has(s.id))
              .map(s => s.tool === 'image'
                ? { ...s, points: [{ x: s.points[0].x + dx, y: s.points[0].y + dy }, s.points[1]] }
                : { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) });
            moved.forEach(s => renderStroke(oCtx, s, imageCacheRef.current));
            const bb = getStrokesBbox(moved); if (bb) { drawSelBox(oCtx, bb); drawResizeHandles(oCtx, bb); }
          }
        } else if (selectModeRef.current === 'resizing') {
          const origBbox = resizeOrigBboxRef.current;
          if (origBbox) {
            const newBbox = computeResizeBbox(origBbox, resizeHandleRef.current, pos);
            const bCtx = baseCtx();
            if (bCtx && preMoveRef.current) bCtx.putImageData(preMoveRef.current, 0, 0);
            const oCtx = overlayCtx(); const ov = overlayRef.current;
            if (oCtx && ov) {
              oCtx.clearRect(0, 0, ov.width, ov.height);
              const scaled = resizeOrigStrokesRef.current.map(s => scaleStroke(s, origBbox, newBbox));
              scaled.forEach(s => renderStroke(oCtx, s, imageCacheRef.current));
              const scaledBb = getStrokesBbox(scaled);
              if (scaledBb) { drawSelBox(oCtx, scaledBb); drawResizeHandles(oCtx, scaledBb); }
            }
          }
        } else if (selectModeRef.current === 'selected') {
          // Update hover cursor for resize handles
          const selStrokes = strokesRef.current.filter(s => selectedIdsRef.current.has(s.id));
          const bb = getStrokesBbox(selStrokes);
          let newCur = 'crosshair';
          if (bb) {
            const h = getResizeHandle(bb, pos);
            newCur = h ? RESIZE_CURSOR[h] : bboxContains(bb, pos) ? 'move' : 'crosshair';
          }
          if (newCur !== resizeCursorRef.current) { resizeCursorRef.current = newCur; setResizeCursor(newCur); }
        }
        return;
      }

      if (!drawing.current || !activeStroke.current) return;
      const s = activeStroke.current;
      if (s.tool === 'pen' || s.tool === 'eraser') s.points.push(pos);
      else s.points = [startPt.current, pos];
      const oCtx = overlayCtx();
      if (oCtx) { oCtx.clearRect(0, 0, canvas.width, canvas.height); renderStroke(oCtx, s); }
    };

    const commitMove = (pos: Point) => {
      const dx = pos.x - moveStartRef.current.x;
      const dy = pos.y - moveStartRef.current.y;
      strokesRef.current = strokesRef.current.map(s => {
        if (!selectedIdsRef.current.has(s.id)) return s;
        if (s.tool === 'image') return { ...s, points: [{ x: s.points[0].x + dx, y: s.points[0].y + dy }, s.points[1]] };
        return { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
      });
      preMoveRef.current = null;
      redrawBase();
      showSelOverlay();
      if (dx !== 0 || dy !== 0) {
        const ids = Array.from(selectedIdsRef.current);
        sendMoveStrokesRef.current({ ids, dx, dy });
        undoStackRef.current.push({ type: 'move', ids, dx, dy });
      }
      selectModeRef.current = 'selected'; setSelectMode('selected');
    };

    const end = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const pos = getEventPos(e, canvas);

      if (toolRef.current === 'select') {
        if (selectModeRef.current === 'selecting') {
          const rx = selStartRef.current.x, ry = selStartRef.current.y;
          const rw = pos.x - rx, rh = pos.y - ry;
          const newSel = new Set(strokesRef.current.filter(s => strokeInRect(s, rx, ry, rw, rh)).map(s => s.id));
          setSelected(newSel);
          const oCtx = overlayCtx(); const ov = overlayRef.current;
          if (oCtx && ov) {
            oCtx.clearRect(0, 0, ov.width, ov.height);
            if (newSel.size > 0) {
              const bb = getStrokesBbox(strokesRef.current.filter(s => newSel.has(s.id)));
              if (bb) drawSelBox(oCtx, bb);
            }
          }
          selectModeRef.current = newSel.size > 0 ? 'selected' : 'idle';
          setSelectMode(newSel.size > 0 ? 'selected' : 'idle');
        } else if (selectModeRef.current === 'moving') {
          commitMove(pos);
        } else if (selectModeRef.current === 'resizing') {
          const origBbox = resizeOrigBboxRef.current;
          if (origBbox) {
            const newBbox = computeResizeBbox(origBbox, resizeHandleRef.current, pos);
            const origSnap = resizeOrigStrokesRef.current.map(s => ({ id: s.id, points: s.points, width: s.width }));
            const scaled   = resizeOrigStrokesRef.current.map(s => scaleStroke(s, origBbox, newBbox));
            const scaledMap = new Map(scaled.map(s => [s.id, s]));
            strokesRef.current = strokesRef.current.map(s => scaledMap.get(s.id) ?? s);
            preMoveRef.current = null;
            redrawBase(); showSelOverlay();
            undoStackRef.current.push({ type: 'resize', origStrokes: origSnap });
            sendResizeStrokesRef.current(scaled.map(s => ({ id: s.id, points: s.points, width: s.width })));
          } else {
            preMoveRef.current = null; redrawBase(); showSelOverlay();
          }
          selectModeRef.current = 'selected'; setSelectMode('selected');
          resizeCursorRef.current = 'crosshair'; setResizeCursor('crosshair');
        }
        return;
      }

      if (!drawing.current || !activeStroke.current) return;
      drawing.current = false;
      const stroke = activeStroke.current; activeStroke.current = null;
      strokesRef.current.push(stroke);
      const bCtx = baseCtx(); if (bCtx) renderStroke(bCtx, stroke, imageCacheRef.current);
      const oCtx = overlayCtx(); if (oCtx) oCtx.clearRect(0, 0, canvas.width, canvas.height);
      sendStroke(stroke);
      undoStackRef.current.push({ type: 'stroke', id: stroke.id });
    };

    const leave = () => {
      sendCursorLeave();
      if (toolRef.current === 'select') {
        if (selectModeRef.current === 'moving') {
          // Cancel move, restore
          if (preMoveRef.current) { const bCtx = baseCtx(); if (bCtx) bCtx.putImageData(preMoveRef.current, 0, 0); preMoveRef.current = null; }
          showSelOverlay();
          selectModeRef.current = 'selected'; setSelectMode('selected');
        } else if (selectModeRef.current === 'resizing') {
          // Cancel resize, restore
          if (preMoveRef.current) { const bCtx = baseCtx(); if (bCtx) bCtx.putImageData(preMoveRef.current, 0, 0); preMoveRef.current = null; }
          showSelOverlay();
          selectModeRef.current = 'selected'; setSelectMode('selected');
          resizeCursorRef.current = 'crosshair'; setResizeCursor('crosshair');
        } else if (selectModeRef.current === 'selecting') {
          const oCtx = overlayCtx(); const ov = overlayRef.current;
          if (oCtx && ov) oCtx.clearRect(0, 0, ov.width, ov.height);
          selectModeRef.current = 'idle'; setSelectMode('idle');
        }
        return;
      }
      if (drawing.current && activeStroke.current) {
        drawing.current = false;
        const stroke = activeStroke.current; activeStroke.current = null;
        strokesRef.current.push(stroke);
        const bCtx = baseCtx(); if (bCtx) renderStroke(bCtx, stroke, imageCacheRef.current);
        const oCtx = overlayCtx(); if (oCtx) oCtx.clearRect(0, 0, canvas.width, canvas.height);
        sendStroke(stroke);
        undoStackRef.current.push({ type: 'stroke', id: stroke.id });
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
  }, [sendStroke, sendCursorMove, sendCursorLeave, commitText, userId, userName, redrawBase, setSelected, showSelOverlay, setResizeCursor]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const entry = undoStackRef.current.pop()!;
    if (entry.type === 'stroke') {
      strokesRef.current = strokesRef.current.filter(s => s.id !== entry.id);
      if (selectedIdsRef.current.has(entry.id)) { const next = new Set(selectedIdsRef.current); next.delete(entry.id); setSelected(next); }
      redrawBase(); sendUndo(entry.id);
    } else if (entry.type === 'move') {
      const dx = -entry.dx, dy = -entry.dy;
      const idsSet = new Set(entry.ids);
      strokesRef.current = strokesRef.current.map(s => {
        if (!idsSet.has(s.id)) return s;
        if (s.tool === 'image') return { ...s, points: [{ x: s.points[0].x + dx, y: s.points[0].y + dy }, s.points[1]] };
        return { ...s, points: s.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
      });
      redrawBase(); showSelOverlay();
      sendMoveStrokes({ ids: entry.ids, dx, dy });
    } else {
      const updMap = new Map(entry.origStrokes.map(u => [u.id, u]));
      strokesRef.current = strokesRef.current.map(s => {
        const orig = updMap.get(s.id);
        return orig ? { ...s, points: orig.points, width: orig.width } : s;
      });
      redrawBase(); showSelOverlay();
      sendResizeStrokes(entry.origStrokes);
    }
  }, [redrawBase, sendUndo, sendMoveStrokes, sendResizeStrokes, setSelected, showSelOverlay]);

  // Paste image onto whiteboard (skip when focus is in a textarea/input)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return;
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find(item => item.type.startsWith('image/'));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      const dataUrl = await compressImageFile(file);
      const img = new Image();
      img.onload = () => {
        const canvas = baseRef.current;
        if (!canvas) return;
        const x = Math.max(0, (canvas.width  - img.naturalWidth)  / 2);
        const y = Math.max(0, (canvas.height - img.naturalHeight) / 2);
        const stroke: Stroke = {
          id: uuid(), tool: 'image', color: '', width: 0,
          points: [{ x, y }, { x: img.naturalWidth, y: img.naturalHeight }],
          userId, imageData: dataUrl,
        };
        strokesRef.current.push(stroke);
        imageCacheRef.current.set(stroke.id, img);
        undoStackRef.current.push({ type: 'stroke', id: stroke.id });
        redrawBase();
        sendStrokeRef.current(stroke);
      };
      img.src = dataUrl;
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [userId, redrawBase]);

  const handleClear = useCallback(() => {
    if (!confirm('このページを全消去しますか？')) return;
    sendClear();
  }, [sendClear]);

  const handleExport = useCallback(() => {
    const base = baseRef.current; if (!base) return;
    const link = document.createElement('a');
    link.download = `whiteboard-${roomId}.png`;
    link.href = base.toDataURL('image/png'); link.click();
  }, [roomId]);

  const handleChatToggle = () => { setChatOpen(v => !v); setUnread(0); };

  const handleSendChat = useCallback((text: string, imageData?: string) => {
    const id = uuid();
    setChatMessages(prev => [...prev, { id, userName, text, timestamp: Date.now(), imageData }]);
    sendChatMessage({ id, userName, text, imageData });
  }, [userName, sendChatMessage]);

  const handleSwitchTab = useCallback((tabId: string) => {
    setCurrentTabId(tabId); setSelected(new Set()); setSelMode('idle');
    strokesRef.current = []; setCursors({}); redrawBase(); sendSwitchTab(tabId);
  }, [redrawBase, sendSwitchTab, setSelected, setSelMode]);

  const handleCreateTab = useCallback(() => sendCreateTab(), [sendCreateTab]);

  const handleDeleteTab = useCallback((tabId: string) => {
    if (!confirm('このページを削除しますか？元に戻せません。')) return;
    sendDeleteTab(tabId);
  }, [sendDeleteTab]);

  const cursor = tool === 'text' ? 'text'
    : tool === 'eraser' ? 'cell'
    : tool === 'select' ? (selectMode === 'moving' ? 'grabbing' : resizeCursor)
    : 'crosshair';

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
      <TabBar tabs={tabs} currentTabId={currentTabId} userTabs={userTabs} mySocketId={mySocketId}
        onSwitch={handleSwitchTab} onCreate={handleCreateTab} onDelete={handleDeleteTab} />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
        <canvas ref={baseRef}    style={{ position: 'absolute', inset: 0 }} />
        <canvas ref={overlayRef} style={{ position: 'absolute', inset: 0, cursor }} />

        {/* Selection hint */}
        {tool === 'select' && selectedIds.size > 0 && (
          <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(37,99,235,0.85)', color: '#fff', fontSize: 12, padding: '3px 10px', borderRadius: 12, pointerEvents: 'none', zIndex: 10 }}>
            {selectedIds.size} 個選択中 — ドラッグで移動 / Esc で解除
          </div>
        )}

        {/* Text input overlay */}
        {textInput && (
          <div style={{ position: 'absolute', left: textInput.x, top: textInput.y - fontSize, zIndex: 25 }}>
            <textarea
              autoFocus
              value={textInput.value}
              onChange={e => setTextInput({ ...textInput, value: e.target.value })}
              onKeyDown={e => {
                if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); commitText(); }
                if (e.key === 'Escape') { setTextInput(null); }
              }}
              rows={3}
              style={{
                display: 'block', fontSize, lineHeight: `${fontSize * 1.3}px`,
                fontFamily: 'system-ui, sans-serif', color,
                background: 'rgba(255,255,255,0.9)', border: '1px dashed #94a3b8',
                outline: 'none', resize: 'both', padding: '2px 4px', borderRadius: 3,
                minWidth: 140,
              }}
            />
            <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
              <button onMouseDown={e => e.preventDefault()} onClick={commitText}
                style={{ padding: '2px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                確定
              </button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => setTextInput(null)}
                style={{ padding: '2px 8px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                キャンセル
              </button>
              <span style={{ fontSize: 11, color: '#94a3b8', alignSelf: 'center' }}>Shift+Enter で確定</span>
            </div>
          </div>
        )}

        {/* Remote cursors */}
        {Object.entries(cursors).map(([uid, cur]) => (
          <div key={uid} style={{ position: 'absolute', left: cur.x, top: cur.y, pointerEvents: 'none', zIndex: 20 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" style={{ display: 'block' }}>
              <path d="M4 2 L4 16 L7.5 12.5 L10.5 18.5 L12.5 17.5 L9.5 11 L14 11 Z"
                fill={cur.color} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span style={{ display: 'inline-block', background: cur.color, color: '#fff', fontSize: 11, fontWeight: 600, padding: '1px 5px', borderRadius: 4, marginTop: 2, whiteSpace: 'nowrap', fontFamily: 'system-ui, sans-serif' }}>
              {cur.userName}
            </span>
          </div>
        ))}

        {chatOpen && (
          <ChatPanel messages={chatMessages} userName={userName} onSend={handleSendChat} onClose={handleChatToggle} />
        )}
      </div>
    </div>
  );
}
