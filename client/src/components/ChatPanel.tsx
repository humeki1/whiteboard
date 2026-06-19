import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';

interface Props {
  messages: ChatMessage[];
  userName: string;
  onSend: (text: string) => void;
  onClose: () => void;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ChatPanel({ messages, userName, onSend, onClose }: Props) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
  };

  return (
    <div style={panel}>
      {/* Header */}
      <div style={header}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>チャット</span>
        <button onClick={onClose} style={closeBtn}>✕</button>
      </div>

      {/* Messages */}
      <div style={messageList}>
        {messages.length === 0 && (
          <p style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 24 }}>
            メッセージはまだありません
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.userName === userName;
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 2 }}>
              {!isMe && (
                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 4 }}>{msg.userName}</span>
              )}
              <div style={bubble(isMe)}>
                {msg.text}
              </div>
              <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4, marginRight: 4 }}>
                {formatTime(msg.timestamp)}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={inputArea}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="メッセージを入力..."
          style={inputStyle}
        />
        <button onClick={send} disabled={!input.trim()} style={sendBtn}>
          ↑
        </button>
      </div>
    </div>
  );
}

const panel: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: 280,
  height: '100%',
  background: 'rgba(255,255,255,0.97)',
  borderLeft: '1px solid #e5e7eb',
  display: 'flex',
  flexDirection: 'column',
  zIndex: 30,
  boxShadow: '-4px 0 16px rgba(0,0,0,0.08)',
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px',
  borderBottom: '1px solid #e5e7eb',
  background: '#f8fafc',
};

const closeBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  color: '#64748b',
  padding: '0 4px',
};

const messageList: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '12px 8px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const bubble = (isMe: boolean): React.CSSProperties => ({
  maxWidth: 200,
  padding: '6px 10px',
  borderRadius: isMe ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
  background: isMe ? '#2563eb' : '#f1f5f9',
  color: isMe ? '#fff' : '#1e293b',
  fontSize: 13,
  lineHeight: 1.4,
  wordBreak: 'break-word',
});

const inputArea: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  padding: '8px 10px',
  borderTop: '1px solid #e5e7eb',
  background: '#f8fafc',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  border: '1px solid #e2e8f0',
  borderRadius: 20,
  fontSize: 13,
  outline: 'none',
  background: '#fff',
};

const sendBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: '50%',
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontSize: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};
