import { useState } from "react";
import { ref, set, get, child } from "firebase/database";
import { db } from "../firebase/firebase";
import type { Screen } from "../App";

type Props = {
  setScreen: (screen: Screen) => void;
  setRoomCode: (roomCode: string) => void;
  setPlayerId: (playerId: string) => void;
};

function makePlayerId() {
  return crypto.randomUUID();
}

function JoinGame({ setScreen, setRoomCode, setPlayerId }: Props) {
  const [name, setName] = useState("");
  const [roomInput, setRoomInput] = useState("");

  async function joinRoom() {
    if (!name.trim()) {
      alert("Enter your name first");
      return;
    }

    if (!roomInput.trim()) {
      alert("Enter a room code");
      return;
    }

    const code = roomInput.trim().toUpperCase();
    const snapshot = await get(child(ref(db), `rooms/${code}`));

    if (!snapshot.exists()) {
      alert("Room not found");
      return;
    }

    const id = makePlayerId();

    await set(ref(db, `rooms/${code}/players/${id}`), {
      name: name.trim(),
      isHost: false,
    });

    setRoomCode(code);
    setPlayerId(id);
    setScreen("lobby");
  }

  return (
    <div className="app">
      <h1>Join Game</h1>

      <input
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <input
        placeholder="Room code"
        value={roomInput}
        onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
      />

      <button onClick={joinRoom}>Join Room</button>

      <button className="secondary" onClick={() => setScreen("home")}>
        Back
      </button>
    </div>
  );
}

export default JoinGame;