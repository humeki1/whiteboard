import { Tool } from '../types';

interface Props {
  tool: Tool;
  color: string;
  width: number;
  userCount: number;
  roomId: string;
  chatOpen: boolean;
  unreadCount: number;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onClear: () => void;
  onUndo: () => void;
  onExport: () => void;
  onChatToggle: () => void;
  onLeave: () => void;
}

const TOOLS: { id: Tool; icon: string; title: string }[] = [
  { id: 'pen',       icon: '✏️', title: 'ペン' },
  { id: 'eraser',    icon: '⬜', title: '消しゴム' },
  { id: 'line',      icon: '╱',  title: '直線' },
  { id: 'rectangle', icon: '□',  title: '四角' },
  { id: 'circle',    icon: '○',  title: '円' },
  { id: 'text',      icon: 'T',  title: 'テキスト' },
];

const PRESET_COLORS = [
  '#000000', '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#3b82f6', '#8b5cf6', '#ffffff',
];

export default function Toolbar({
  tool, color, width, userCount, roomId, chatOpen, unreadCount,
  onToolChange, onColorChange, onWidthChange,
  onClear, onUndo, onExport, onChatToggle, onLeave,
}: Props) {
  const copyRoomId = () => navigator.clipboard.writeText(roomId).catch(() => {});

  const widthLabel = tool === 'text' ? `${width * 4}px` : `${width}px`;

  return (
    <div style={bar}>
      {/* Tool buttons */}
      <div style={group}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => onToolChange(t.id)}
            title={t.title}
            style={{
              ...toolBtn(tool === t.id),
              fontWeight: t.id === 'text' ? 700 : undefined,
              fontFamily: t.id === 'text' ? 'serif' : undefined,
            }}
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
              width: 22, height: 22, borderRadius: '50%', background: c,
              border: `2px solid ${color === c ? '#2563eb' : '#d1d5db'}`,
              cursor: 'pointer', flexShrink: 0,
            }}
          />
        ))}
        <input
          type="color" value={color}
          onChange={(e) => onColorChange(e.target.value)}
          title="カスタムカラー"
          style={{ width: 22, height: 22, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 4 }}
        />
      </div>

      <Sep />

      {/* Stroke / font size */}
      <input type="range" min={1} max={40} value={width}
        onChange={(e) => onWidthChange(Number(e.target.value))}
        style={{ width: 80 }}
      />
      <span style={{ fontSize: 12, color: '#64748b', minWidth: 36 }} title={tool === 'text' ? 'フォントサイズ' : 'ストローク幅'}>
        {widthLabel}
      </span>

      <Sep />

      {/* Actions */}
      <button onClick={onUndo}   title="元に戻す" style={iconBtn}>↩</button>
      <button onClick={onClear}  title="全消去"   style={{ ...iconBtn, color: '#ef4444' }}>🗑</button>
      <button onClick={onExport} title="PNG保存"  style={iconBtn}>💾</button>

      {/* Room info + chat */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Chat button with unread badge */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={onChatToggle}
            title="チャット"
            style={{ ...iconBtn, background: chatOpen ? '#eff6ff' : '#fff', border: `2px solid ${chatOpen ? '#2563eb' : '#e5e7eb'}` }}
          >
            💬
          </button>
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              background: '#ef4444', color: '#fff',
              fontSize: 10, fontWeight: 700,
              width: 16, height: 16, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>
        <button onClick={copyRoomId} title="ルームIDをコピー" style={roomBtn}>
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
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '6px 12px', background: '#fff',
  borderBottom: '1px solid #e5e7eb',
  flexWrap: 'wrap', userSelect: 'none',
};

const group: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
};

const toolBtn = (active: boolean): React.CSSProperties => ({
  width: 34, height: 34,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: `2px solid ${active ? '#2563eb' : '#e5e7eb'}`,
  borderRadius: 6,
  background: active ? '#eff6ff' : '#fff',
  cursor: 'pointer', fontSize: 16, flexShrink: 0,
});

const iconBtn: React.CSSProperties = {
  width: 34, height: 34,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid #e5e7eb', borderRadius: 6,
  background: '#fff', cursor: 'pointer', fontSize: 16, flexShrink: 0,
};

const roomBtn: React.CSSProperties = {
  padding: '4px 10px', background: '#f8fafc',
  border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 12, cursor: 'pointer', color: '#475569',
};
