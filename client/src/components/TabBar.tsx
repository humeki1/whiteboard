import { TabInfo, UserTabInfo } from '../types';

function userColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return `hsl(${h % 360}, 75%, 48%)`;
}

interface Props {
  tabs: TabInfo[];
  currentTabId: string;
  userTabs: UserTabInfo[];
  mySocketId: string;
  onSwitch: (tabId: string) => void;
  onCreate: () => void;
}

export default function TabBar({ tabs, currentTabId, userTabs, mySocketId, onSwitch, onCreate }: Props) {
  const usersByTab: Record<string, UserTabInfo[]> = {};
  for (const u of userTabs) {
    if (!usersByTab[u.tabId]) usersByTab[u.tabId] = [];
    usersByTab[u.tabId].push(u);
  }

  return (
    <div style={bar}>
      {tabs.map((tab) => {
        const isActive = tab.id === currentTabId;
        const users = usersByTab[tab.id] ?? [];
        return (
          <button
            key={tab.id}
            onClick={() => !isActive && onSwitch(tab.id)}
            style={tabBtn(isActive)}
          >
            <span style={{ fontSize: 13 }}>{tab.name}</span>
            {users.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
                {users.slice(0, 4).map((u) => (
                  <span
                    key={u.userId}
                    title={u.userName}
                    style={{
                      width: 16, height: 16, borderRadius: '50%',
                      background: userColor(u.userId),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, color: '#fff', fontWeight: 700,
                      border: `1.5px solid ${u.userId === mySocketId ? '#1d4ed8' : 'rgba(255,255,255,0.5)'}`,
                      flexShrink: 0,
                    }}
                  >
                    {u.userName.charAt(0).toUpperCase()}
                  </span>
                ))}
                {users.length > 4 && (
                  <span style={{ fontSize: 9, color: '#94a3b8', marginLeft: 1 }}>+{users.length - 4}</span>
                )}
              </div>
            )}
          </button>
        );
      })}
      <button onClick={onCreate} title="新しいページを追加" style={addBtn}>+</button>
    </div>
  );
}

const bar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  padding: '0 8px',
  background: '#f1f5f9',
  borderBottom: '1px solid #e5e7eb',
  overflowX: 'auto',
  flexShrink: 0,
  minHeight: 36,
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '5px 14px',
  background: active ? '#fff' : 'transparent',
  border: 'none',
  borderBottom: `2px solid ${active ? '#2563eb' : 'transparent'}`,
  borderRadius: '4px 4px 0 0',
  cursor: active ? 'default' : 'pointer',
  color: active ? '#1e293b' : '#64748b',
  fontWeight: active ? 600 : 400,
  flexShrink: 0,
  whiteSpace: 'nowrap',
  fontFamily: 'system-ui, sans-serif',
  marginBottom: -1,
});

const addBtn: React.CSSProperties = {
  width: 26, height: 26,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent',
  border: '1px dashed #cbd5e1',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 18, lineHeight: 1,
  color: '#94a3b8',
  marginLeft: 4,
  flexShrink: 0,
};
