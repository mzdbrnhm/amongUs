import { useEffect, useState } from "react";
import { ref, onValue, remove, update } from "firebase/database";
import { db } from "../firebase/firebase";
import type { Screen } from "../App";
import { TASKS } from "../data/tasks";
import { FAKE_TASKS } from "../data/fakeTasks";


type Task = {
  text: string;
  completed: boolean;
  type: "real" | "math";
};

type Player = {
  name: string;
  isHost: boolean;
  role?: "crewmate" | "impostor";
  alive?: boolean;
  meetingUsed?: boolean;
  killCooldownEndsAt?: number;
  currentVote?: string | null;
  tasks?: Task[];
};

type Room = {
  status: string;
  hostId: string;
  players?: Record<string, Player>;
  lastImpostorIds?: string[];
};

type Props = {
  setScreen: (screen: Screen) => void;
  roomCode: string;
  playerId: string;
  setRoomCode: (roomCode: string) => void;
  setPlayerId: (playerId: string) => void;
};

function Lobby({
  setScreen,
  roomCode,
  playerId,
  setRoomCode,
  setPlayerId,
}: Props) {
  const [room, setRoom] = useState<Room | null>(null);

  function getRandomIndex(max: number) {
    if (max <= 0) return 0;

    if (window.crypto?.getRandomValues) {
      const randomValues = new Uint32Array(1);
      window.crypto.getRandomValues(randomValues);
      return randomValues[0] % max;
    }

    return Math.floor(Math.random() * max);
  }

  function pickImpostorIds(playerEntries: [string, Player][], impostorCount: number) {
    const previousImpostorIds = room?.lastImpostorIds ?? [];
    const availablePlayers = [...playerEntries];
    const pickedIds: string[] = [];

    while (pickedIds.length < impostorCount && availablePlayers.length > 0) {
      const avoidPrevious = availablePlayers.filter(
        ([id]) => !previousImpostorIds.includes(id)
      );

      const pool = avoidPrevious.length > 0 ? avoidPrevious : availablePlayers;
      const pickedIndex = getRandomIndex(pool.length);
      const [pickedId] = pool[pickedIndex];

      pickedIds.push(pickedId);

      const removeIndex = availablePlayers.findIndex(([id]) => id === pickedId);
      if (removeIndex !== -1) {
        availablePlayers.splice(removeIndex, 1);
      }
    }

    return pickedIds;
  }

  useEffect(() => {
    if (!roomCode) {
      setScreen("home");
      return;
    }

    const roomRef = ref(db, `rooms/${roomCode}`);

    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const roomData = snapshot.val();
        setRoom(roomData);

        if (roomData.status === "roleReveal") {
          setScreen("roleReveal");
        }
      } else {
        setRoom(null);
        setRoomCode("");
        setPlayerId("");
        setScreen("home");
      }
    });

    return () => unsubscribe();
  }, [roomCode, setPlayerId, setRoomCode, setScreen]);

  const players = room?.players ? Object.values(room.players) : [];
  const amHost = room?.hostId === playerId;
  const playerCount = players.length;

  async function startGame() {
    if (!room || !room.players || !amHost) return;

    const playerEntries = Object.entries(room.players);

    if (playerEntries.length < 3) {
      alert("You need at least 3 players to start.");
      return;
    }

    const impostorCount = 1;
    const impostorIds = pickImpostorIds(playerEntries, impostorCount);

    const updates: Record<string, unknown> = {};

    playerEntries.forEach(([id]) => {
      const isImpostor = impostorIds.includes(id);
      const taskPool = isImpostor ? FAKE_TASKS : TASKS;

      const assignedTasks = [...taskPool]
        .sort(() => Math.random() - 0.5)
        .slice(0, 5)
        .map((task) => ({
          text: task,
          completed: false,
          type: "real" as const,
        }));

      updates[`rooms/${roomCode}/players/${id}/role`] = isImpostor
        ? "impostor"
        : "crewmate";
      updates[`rooms/${roomCode}/players/${id}/alive`] = true;
      updates[`rooms/${roomCode}/players/${id}/meetingUsed`] = false;
      updates[`rooms/${roomCode}/players/${id}/killCooldownEndsAt`] = isImpostor
        ? new Date().getTime() + 30000
        : 0;
      updates[`rooms/${roomCode}/players/${id}/currentVote`] = null;
      updates[`rooms/${roomCode}/players/${id}/tasks`] = assignedTasks;
    });

    updates[`rooms/${roomCode}/lastImpostorIds`] = impostorIds;
    updates[`rooms/${roomCode}/alert`] = null;
    updates[`rooms/${roomCode}/status`] = "roleReveal";

    await update(ref(db), updates);
  }

  async function cancelGame() {
    if (!roomCode || !amHost) return;

    const confirmed = window.confirm(
      "Cancel this game and send everyone back home?"
    );

    if (!confirmed) return;

    await remove(ref(db, `rooms/${roomCode}`));
  }

  return (
    <div className="app">
      <div className="lobby-header">
        <p className="eyebrow">Game Lobby</p>
        <h1>Among Us IRL</h1>
      </div>

      <div className="room-card">
        <p>Room Code</p>
        <div className="room-code">{roomCode}</div>
        <span>Share this code with your friends</span>
      </div>

      <div className="lobby-panel">
        <div className="panel-header">
          <h2>Players</h2>
          <span>{playerCount}/12</span>
        </div>

        <div className="player-list">
          {players.map((player, index) => (
            <div key={index} className="player-card">
              <div className="player-avatar">
                {player.name.charAt(0).toUpperCase()}
              </div>

              <div className="player-info">
                <strong>{player.name}</strong>
                <span>{player.isHost ? "Host 👑" : "Waiting"}</span>
              </div>

              <div className="ready-dot" />
            </div>
          ))}
        </div>
      </div>

      {amHost ? (
        <div className="host-actions">
          <button className="start-button" onClick={startGame}>
            Start Game
          </button>
          <button className="cancel-button" onClick={cancelGame}>
            Cancel Game
          </button>
        </div>
      ) : (
        <p className="waiting-text">Waiting for host to start...</p>
      )}
    </div>
  );
}

export default Lobby;