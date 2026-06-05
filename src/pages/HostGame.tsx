import { useState } from "react";
import { ref, set } from "firebase/database";
import { db } from "../firebase/firebase";
import type { Screen } from "../App";

type Props = {
  setScreen: (screen: Screen) => void;
  setRoomCode: (roomCode: string) => void;
  setPlayerId: (playerId: string) => void;
};

function makeRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function makePlayerId() {
  return crypto.randomUUID();
}

function HostGame({ setScreen, setRoomCode, setPlayerId }: Props) {
  const [name, setName] = useState("");

  async function createRoom() {
    if (!name.trim()) {
      alert("Enter your name first");
      return;
    }

    const code = makeRoomCode();
    const id = makePlayerId();

    await set(ref(db, `rooms/${code}`), {
      status: "lobby",
      hostId: id,
      players: {
        [id]: {
          name: name.trim(),
          isHost: true,
        },
      },
    });

    setRoomCode(code);
    setPlayerId(id);
    setScreen("lobby");
  }

  return (
    <div className="app">
      <h1>Host Game</h1>

      <input
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <button onClick={createRoom}>Create Room</button>

      <button className="secondary" onClick={() => setScreen("home")}>
        Back
      </button>
    </div>
  );
}

export default HostGame;