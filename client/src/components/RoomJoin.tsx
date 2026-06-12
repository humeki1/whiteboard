import { useState } from 'react';
import { v4 as uuid } from 'uuid';

interface Props {
  onJoin: (roomId: string) => void;
}

export default function RoomJoin({ onJoin }: Props) {
  const [input, setInput] = useState('');

  const createRoom = () => onJoin(uuid().slice(0, 8));
  const joinRoom = () => {
    const id = input.trim();
    if (id) onJoin(id);
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Whiteboard</h1>
        <p style={styles.subtitle}>リアルタイム共同ホワイトボード</p>

        <button onClick={createRoom} style={styles.primaryBtn}>
          新しいルームを作成
        </button>

        <div style={styles.divider}>
          <span style={styles.dividerText}>または</span>
        </div>

        <div style={styles.row}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
            placeholder="ルームIDを入力"
            style={styles.input}
          />
          <button onClick={joinRoom} style={styles.secondaryBtn}>
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
    marginBottom: 8,
  },
  primaryBtn: {
    padding: '12px 0',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  dividerText: {
    color: '#94a3b8',
    fontSize: 13,
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
  },
  secondaryBtn: {
    padding: '10px 16px',
    background: '#16a34a',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
