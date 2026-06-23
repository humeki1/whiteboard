import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';

interface Props {
  messages: ChatMessage[];
  userName: string;
  onSend: (text: string, imageData?: string) => void;
  onClose: () => void;
}

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function compressChatImage(file: File, maxW = 600, maxH = 500): Promise<string> {
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
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.src = url;
  });
}

export default function ChatPanel({ messages, userName, onSend, onClose }: Props) {
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const text = input.trim();
    if (!text && !pendingImage) return;
    onSend(text, pendingImage ?? undefined);
    setInput('');
    setPendingImage(null);
  };

  const handleTextareaPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    const dataUrl = await compressChatImage(file);
    setPendingImage(dataUrl);
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
                {msg.text && <span>{msg.text}</span>}
                {msg.imageData && (
                  <img
                    src={msg.imageData}
                    alt="画像"
                    style={{ display: 'block', maxWidth: '100%', borderRadius: 6, marginTop: msg.text ? 6 : 0, cursor: 'zoom-in' }}
                    onClick={() => setLightboxSrc(msg.imageData!)}
                  />
                )}
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {pendingImage && (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img src={pendingImage} alt="送信予定" style={{ maxWidth: '100%', maxHeight: 80, borderRadius: 6, border: '1px solid #e2e8f0' }} />
              <button
                onClick={() => setPendingImage(null)}
                style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 10, cursor: 'pointer', lineHeight: 1 }}
              >✕</button>
            </div>
          )}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); send(); }
            }}
            onPaste={handleTextareaPaste}
            placeholder={'メッセージを入力...\n(画像もペースト可 / Shift+Enter で送信)'}
            rows={2}
            style={inputStyle}
          />
        </div>
        <button onClick={send} disabled={!input.trim() && !pendingImage} style={sendBtn}>
          ↑
        </button>
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={lightboxSrc}
            alt="全画面"
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxSrc(null)}
            style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}
          >✕</button>
        </div>
      )}
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
  borderRadius: 12,
  fontSize: 13,
  outline: 'none',
  background: '#fff',
  resize: 'none',
  fontFamily: 'system-ui, sans-serif',
  lineHeight: 1.4,
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
