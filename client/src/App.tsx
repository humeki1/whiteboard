import { useState } from 'react';
import RoomJoin from './components/RoomJoin';
import Whiteboard from './components/Whiteboard';

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);

  if (!roomId) {
    return <RoomJoin onJoin={setRoomId} />;
  }

  return <Whiteboard roomId={roomId} onLeave={() => setRoomId(null)} />;
}
