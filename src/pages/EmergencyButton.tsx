import { useEffect, useState } from "react";
import { ref, get, child, update, onValue } from "firebase/database";
import { db } from "../firebase/firebase";
import type { Screen } from "../App";

type Props = {
  setScreen: (screen: Screen) => void;
};

type Sabotage = {
  active: boolean;
  type: "o2" | "reactor" | "freeze" | null;
  expiresAt?: number;
};

type Room = {
  status: string;
  sabotage?: Sabotage | null;
};

function EmergencyButton({ setScreen }: Props) {
  const [roomInput, setRoomInput] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!roomCode) return;

    const roomRef = ref(db, `rooms/${roomCode}`);

    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (!snapshot.exists()) {
        setRoom(null);
        setRoomCode("");
        setError("Room no longer exists.");
        return;
      }

      setRoom(snapshot.val());
    });

    return () => unsubscribe();
  }, [roomCode]);

  useEffect(() => {
    const tick = () => setNow(new Date().getTime());
    tick();

    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, []);

  function playAlarm() {
    const audio = new Audio("/alarm.mp3");
    audio.volume = 1;

    audio.play().catch(() => {
      console.log("Audio blocked until user interacts with page.");
    });
  }

  async function connectToRoom() {
    const code = roomInput.trim().toUpperCase();

    if (!code) {
      setError("Enter a room code.");
      return;
    }

    const snapshot = await get(child(ref(db), `rooms/${code}`));

    if (!snapshot.exists()) {
      setError("Room not found.");
      return;
    }

    setError("");
    setRoomCode(code);
  }

  async function pressEmergencyButton() {
    if (!roomCode || !room) return;

    const sabotageDisabled =
      room.sabotage?.active === true &&
      (room.sabotage.type === "o2" || room.sabotage.type === "reactor");

    const gameStateDisabled = room.status !== "game";

    if (sabotageDisabled || gameStateDisabled) return;

    playAlarm();

    await update(ref(db), {
      [`rooms/${roomCode}/status`]: "meeting",
      [`rooms/${roomCode}/alert`]: {
        type: "meeting",
        triggeredBy: "Emergency Button",
        timestamp: new Date().getTime(),
      },
      [`rooms/${roomCode}/meetingEndsAt`]: null,
      [`rooms/${roomCode}/meetingResult`]: null,
      [`rooms/${roomCode}/sabotage/active`]: false,
      [`rooms/${roomCode}/sabotage/type`]: null,
      [`rooms/${roomCode}/sabotage/expiresAt`]: 0,
      [`rooms/${roomCode}/sabotage/reactorHolders`]: null,
    });
  }

  if (!roomCode) {
    return (
      <div className="app">
        <p className="eyebrow">Emergency Station</p>
        <h1>Button</h1>

        <div className="role-card">
          <p>Enter the room code to turn this device into the emergency button.</p>

          <input
            placeholder="Room code"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
          />

          {error && <p>{error}</p>}
        </div>

        <button onClick={connectToRoom}>Connect Button</button>
        <button className="secondary" onClick={() => setScreen("home")}>
          Back
        </button>
      </div>
    );
  }

  const sabotageDisabled =
    room?.sabotage?.active === true &&
    (room.sabotage.type === "o2" || room.sabotage.type === "reactor");

  const gameStateDisabled = room?.status !== "game";

  const buttonDisabled = sabotageDisabled || gameStateDisabled;

  const sabotageSecondsLeft = room?.sabotage?.expiresAt
    ? Math.max(0, Math.ceil((room.sabotage.expiresAt - now) / 1000))
    : 0;

  const disabledReason = sabotageDisabled
    ? `${room?.sabotage?.type?.toUpperCase()} sabotage active. Emergency button disabled for ${sabotageSecondsLeft}s.`
    : room?.status === "lobby"
    ? "Waiting for the game to start."
    : room?.status === "roleReveal"
    ? "Roles are being revealed."
    : room?.status === "meeting" || room?.status === "meetingReveal"
    ? "Meeting already in progress."
    : room?.status === "crewTaskWin" || room?.status === "impostorWin"
    ? "Game is over. Return to lobby to restart."
    : "Emergency button unavailable right now.";

  return (
    <div className="app emergency-button-page">
      <p className="eyebrow">Room {roomCode}</p>
      <h1>Emergency</h1>

      <button
        className="big-emergency-button"
        onClick={pressEmergencyButton}
        disabled={buttonDisabled}
      >
        {buttonDisabled ? "DISABLED" : "PRESS"}
      </button>

      <p className="waiting-text">
        {buttonDisabled ? disabledReason : "Physical emergency button is armed."}
      </p>

      {sabotageDisabled && (
        <div className="role-card">
          <h2>{room?.sabotage?.type?.toUpperCase()} Active</h2>
          <p>Emergency meetings are disabled until this sabotage is fixed or expires.</p>
          <strong>{sabotageSecondsLeft}s remaining</strong>
        </div>
      )}

      <button className="secondary" onClick={() => setRoomCode("")}>Change Room</button>
      <button className="secondary" onClick={() => setScreen("home")}>Back Home</button>
    </div>
  );
}

export default EmergencyButton;
