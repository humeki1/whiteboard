import { useState, useRef, useEffect, useCallback } from 'react';
import { v4 as uuid } from 'uuid';
import { Tool, Point, Stroke } from '../types';
import Toolbar from './Toolbar';
import { useSocket } from '../hooks/useSocket';

interface Props {
  roomId: string;
  onLeave: () => void;
}

// Draw a single stroke onto a canvas context. Defined at module level for stability.
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
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  } else if (tool === 'rectangle') {
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.strokeRect(first.x, first.y, last.x - first.x, last.y - first.y);
  } else if (tool === 'circle') {
    const last = points[points.length - 1];
    const rx = Math.abs(last.x - first.x) / 2;
    const ry = Math.abs(last.y - first.y) / 2;
    const cx = (first.x + last.x) / 2;
    const cy = (first.y + last.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function getEventPos(e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  const src = 'touches' in e ? e.touches[0] : e;
  return {
    x: src.clientX - rect.left,
    y: src.clientY - rect.top,
  };
}

export default function Whiteboard({ roomId, onLeave }: Props) {
  const [tool, setTool]           = useState<Tool>('pen');
  const [color, setColor]         = useState('#000000');
  const [width, setWidth]         = useState(4);
  const [userCount, setUserCount] = useState(1);

  // Two stacked canvases: base = committed strokes, overlay = in-progress stroke
  const baseRef    = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const strokesRef       = useRef<Stroke[]>([]);
  const activeStroke     = useRef<Stroke | null>(null);
  const drawing          = useRef(false);
  const startPt          = useRef<Point>({ x: 0, y: 0 });
  const userId           = useRef(uuid()).current;

  // Current tool/color/width in refs so event handlers always see latest values
  const toolRef  = useRef(tool);
  const colorRef = useRef(color);
  const widthRef = useRef(width);
  toolRef.current  = tool;
  colorRef.current = color;
  widthRef.current = width;

  const baseCtx = () => baseRef.current?.getContext('2d') ?? null;
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
    const base    = baseRef.current;
    const overlay = overlayRef.current;
    if (!base || !overlay) return;
    const { clientWidth: w, clientHeight: h } = base.parentElement!;
    base.width    = w; base.height    = h;
    overlay.width = w; overlay.height = h;
    const ctx = baseCtx();
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    redrawBase();
  }, [redrawBase]);

  // Socket callbacks
  const onInit = useCallback((strokes: Stroke[]) => {
    strokesRef.current = strokes;
    redrawBase();
  }, [redrawBase]);

  const onStroke = useCallback((stroke: Stroke) => {
    strokesRef.current.push(stroke);
    const ctx = baseCtx();
    if (ctx) renderStroke(ctx, stroke);
  }, []);

  const onClear = useCallback(() => {
    strokesRef.current = [];
    redrawBase();
  }, [redrawBase]);

  const onUndo = useCallback((strokeId: string) => {
    strokesRef.current = strokesRef.current.filter((s) => s.id !== strokeId);
    redrawBase();
  }, [redrawBase]);

  const { sendStroke, sendClear, sendUndo } = useSocket(roomId, {
    onInit, onStroke, onClear, onUndo, onUserCount: setUserCount,
  });

  // Initialize canvases on mount and handle window resize
  useEffect(() => {
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);
    return () => window.removeEventListener('resize', resizeCanvases);
  }, [resizeCanvases]);

  // Mouse/touch event handlers on the overlay canvas
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      drawing.current = true;
      const pos = getEventPos(e, canvas);
      startPt.current = pos;
      activeStroke.current = {
        id: uuid(),
        tool: toolRef.current,
        color: colorRef.current,
        width: widthRef.current,
        points: [pos],
        userId,
      };
    };

    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!drawing.current || !activeStroke.current) return;
      const pos = getEventPos(e, canvas);
      const s = activeStroke.current;

      if (s.tool === 'pen' || s.tool === 'eraser') {
        s.points.push(pos);
      } else {
        s.points = [startPt.current, pos];
      }

      const ctx = overlayCtx();
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderStroke(ctx, s);
      }
    };

    const end = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!drawing.current || !activeStroke.current) return;
      drawing.current = false;

      const stroke = activeStroke.current;
      activeStroke.current = null;

      // Commit stroke to base canvas
      strokesRef.current.push(stroke);
      const bCtx = baseCtx();
      if (bCtx) renderStroke(bCtx, stroke);

      const oCtx = overlayCtx();
      if (oCtx) oCtx.clearRect(0, 0, canvas.width, canvas.height);

      sendStroke(stroke);
    };

    canvas.addEventListener('mousedown',  start,  { passive: false });
    canvas.addEventListener('mousemove',  move,   { passive: false });
    canvas.addEventListener('mouseup',    end,    { passive: false });
    canvas.addEventListener('mouseleave', end,    { passive: false });
    canvas.addEventListener('touchstart', start,  { passive: false });
    canvas.addEventListener('touchmove',  move,   { passive: false });
    canvas.addEventListener('touchend',   end,    { passive: false });

    return () => {
      canvas.removeEventListener('mousedown',  start);
      canvas.removeEventListener('mousemove',  move);
      canvas.removeEventListener('mouseup',    end);
      canvas.removeEventListener('mouseleave', end);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove',  move);
      canvas.removeEventListener('touchend',   end);
    };
  }, [sendStroke, userId]);

  const handleUndo = useCallback(() => {
    const mine = strokesRef.current.filter((s) => s.userId === userId);
    if (mine.length === 0) return;
    const last = mine[mine.length - 1];
    strokesRef.current = strokesRef.current.filter((s) => s.id !== last.id);
    redrawBase();
    sendUndo(last.id);
  }, [redrawBase, sendUndo, userId]);

  const handleClear = useCallback(() => {
    if (!confirm('ボードを全消去しますか？')) return;
    sendClear();
  }, [sendClear]);

  const handleExport = useCallback(() => {
    const base    = baseRef.current;
    const overlay = overlayRef.current;
    if (!base || !overlay) return;

    // Merge base + overlay for export
    const merged = document.createElement('canvas');
    merged.width  = base.width;
    merged.height = base.height;
    const ctx = merged.getContext('2d')!;
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(overlay, 0, 0);

    const link = document.createElement('a');
    link.download = `whiteboard-${roomId}.png`;
    link.href = merged.toDataURL('image/png');
    link.click();
  }, [roomId]);

  const cursor = tool === 'eraser' ? 'cell' : 'crosshair';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <Toolbar
        tool={tool}
        color={color}
        width={width}
        userCount={userCount}
        roomId={roomId}
        onToolChange={setTool}
        onColorChange={setColor}
        onWidthChange={setWidth}
        onClear={handleClear}
        onUndo={handleUndo}
        onExport={handleExport}
        onLeave={onLeave}
      />
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#fff' }}>
        <canvas ref={baseRef}    style={{ position: 'absolute', inset: 0 }} />
        <canvas ref={overlayRef} style={{ position: 'absolute', inset: 0, cursor }} />
      </div>
    </div>
  );
}
