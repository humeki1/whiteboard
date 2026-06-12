import { Tool } from '../types';

interface Props {
  tool: Tool;
  color: string;
  width: number;
  userCount: number;
  roomId: string;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onClear: () => void;
  onUndo: () => void;
  onExport: () => void;
  onLeave: () => void;
}

const TOOLS: { id: Tool; icon: string; title: string }[] = [
  { id: 'pen',       icon: '✏️', title: 'ペン' },
  { id: 'eraser',    icon: '⬜', title: '消しゴム' },
  { id: 'line',      icon: '╱',  title: '直線' },
  { id: 'rectangle', icon: '□',  title: '四角' },
  { id: 'circle',    icon: '○',  title: '円' },
];

const PRESET_COLORS = [
  '#000000', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ffffff',
];

export default function Toolbar({
  tool, color, width, userCount, roomId,
  onToolChange, onColorChange, onWidthChange,
  onClear, onUndo, onExport, onLeave,
}: Props) {
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId).catch(() => {});
  };

  return (
    <div style={bar}>
      {/* Tool buttons */}
      <div style={group}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => onToolChange(t.id)}
            title={t.title}
            style={toolBtn(tool === t.id)}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <Sep />

      {/* Preset colors */}
      <div style={group}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onColorChange(c)}
            title={c}
            style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: c,
              border: `2px solid ${color === c ? '#2563eb' : '#d1d5db'}`,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          />
        ))}
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          title="カスタムカラー"
          style={{ width: 22, height: 22, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 4 }}
        />
      </div>

      <Sep />

      {/* Stroke width */}
      <input
        type="range"
        min={1}
        max={40}
        value={width}
        onChange={(e) => onWidthChange(Number(e.target.value))}
        style={{ width: 80 }}
      />
      <span style={{ fontSize: 12, color: '#64748b', minWidth: 28 }}>{width}px</span>

      <Sep />

      {/* Actions */}
      <button onClick={onUndo}   title="元に戻す" style={iconBtn}>↩</button>
      <button onClick={onClear}  title="全消去"   style={{ ...iconBtn, color: '#ef4444' }}>🗑</button>
      <button onClick={onExport} title="PNG保存"  style={iconBtn}>💾</button>

      {/* Room info */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={copyRoomId}
          title="ルームIDをコピー"
          style={roomBtn}
        >
          Room: <strong>{roomId}</strong>
        </button>
        <span style={{ fontSize: 12, color: '#64748b' }}>👥 {userCount}</span>
        <button onClick={onLeave} style={{ ...iconBtn, fontSize: 12, padding: '0 10px', width: 'auto' }}>退室</button>
      </div>
    </div>
  );
}

function Sep() {
  return <div style={{ width: 1, height: 28, background: '#e5e7eb', flexShrink: 0 }} />;
}

const bar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 12px',
  background: '#fff',
  borderBottom: '1px solid #e5e7eb',
  flexWrap: 'wrap',
  userSelect: 'none',
};

const group: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const toolBtn = (active: boolean): React.CSSProperties => ({
  width: 34,
  height: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `2px solid ${active ? '#2563eb' : '#e5e7eb'}`,
  borderRadius: 6,
  background: active ? '#eff6ff' : '#fff',
  cursor: 'pointer',
  fontSize: 16,
  flexShrink: 0,
});

const iconBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 16,
  flexShrink: 0,
};

const roomBtn: React.CSSProperties = {
  padding: '4px 10px',
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  color: '#475569',
};
