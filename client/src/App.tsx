import { useState } from 'react';
import RoomJoin from './components/RoomJoin';
import Whiteboard from './components/Whiteboard';

interface Session {
  roomId: string;
  userName: string;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  if (!session) {
    return <RoomJoin onJoin={(roomId, userName) => setSession({ roomId, userName })} />;
  }

  return (
    <Whiteboard
      roomId={session.roomId}
      userName={session.userName}
      onLeave={() => setSession(null)}
    />
  );
}
