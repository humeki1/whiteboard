import { useState } from 'react';
import { v4 as uuid } from 'uuid';

interface Props {
  onJoin: (roomId: string, userName: string) => void;
}

const NAME_KEY = 'wb_user_name';

export default function RoomJoin({ onJoin }: Props) {
  const [name, setName]   = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const [roomId, setRoomId] = useState('');

  const canJoin = name.trim().length > 0;

  const saveName = () => localStorage.setItem(NAME_KEY, name.trim());

  const createRoom = () => {
    if (!canJoin) return;
    saveName();
    onJoin(uuid().slice(0, 8), name.trim());
  };

  const joinRoom = () => {
    if (!canJoin || !roomId.trim()) return;
    saveName();
    onJoin(roomId.trim(), name.trim());
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Whiteboard</h1>
        <p style={styles.subtitle}>リアルタイム共同ホワイトボード</p>

        {/* ユーザー名入力 */}
        <div>
          <label style={styles.label}>ユーザー名</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="名前を入力"
            maxLength={20}
            style={styles.input}
            autoFocus
          />
        </div>

        <button onClick={createRoom} disabled={!canJoin} style={{
          ...styles.primaryBtn,
          opacity: canJoin ? 1 : 0.4,
          cursor: canJoin ? 'pointer' : 'not-allowed',
        }}>
          新しいルームを作成
        </button>

        <div style={styles.divider}>
          <span style={styles.dividerText}>または既存ルームに参加</span>
        </div>

        <div style={styles.row}>
          <input
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
            placeholder="ルームIDを入力"
            style={styles.input}
          />
          <button
            onClick={joinRoom}
            disabled={!canJoin || !roomId.trim()}
            style={{
              ...styles.secondaryBtn,
              opacity: canJoin && roomId.trim() ? 1 : 0.4,
              cursor: canJoin && roomId.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            参加
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100dvh',
    background: '#f0f4ff',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '48px 40px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    width: 320,
  },
  title: {
    fontSize: 28,
    fontWeight: 700,
    textAlign: 'center',
    color: '#1e293b',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 4,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 6,
  },
  primaryBtn: {
    padding: '12px 0',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    width: '100%',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
  },
  dividerText: {
    color: '#94a3b8',
    fontSize: 12,
    margin: '0 auto',
  },
  row: {
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    width: '100%',
  },
  secondaryBtn: {
    padding: '10px 16px',
    background: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
  },
};
