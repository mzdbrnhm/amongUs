import { useEffect, useState } from "react";
import { ref, onValue, update } from "firebase/database";
import { db } from "../firebase/firebase";
import type { Screen } from "../App";

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
  tasks?: Task[];
  killCooldownEndsAt?: number | null;
};

type Room = {
  players?: Record<string, Player>;
};

type Props = {
  roomCode: string;
  playerId: string;
  setScreen: (screen: Screen) => void;
};

const KILL_COOLDOWN = 30000;
const SABOTAGE_COOLDOWN = 60000;

function RoleReveal({ roomCode, playerId, setScreen }: Props) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [room, setRoom] = useState<Room | null>(null);

  useEffect(() => {
    if (!roomCode || !playerId) {
      setScreen("home");
      return;
    }

    const roomRef = ref(db, `rooms/${roomCode}`);

    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (!snapshot.exists()) {
        setScreen("home");
        return;
      }

      const roomData = snapshot.val();
      setRoom(roomData);
      setPlayer(roomData.players?.[playerId] ?? null);
    });

    return () => unsubscribe();
  }, [roomCode, playerId, setScreen]);

useEffect(() => {
  if (!player?.role || !roomCode || !room?.players) return;

  const players = room.players;

  const timer = window.setTimeout(async () => {
      try {
        const currentTime = new Date().getTime();
        const updates: Record<string, unknown> = {
          [`rooms/${roomCode}/status`]: "game",
          [`rooms/${roomCode}/sabotage`]: {
            active: false,
            type: null,
            cooldownEndsAt: currentTime + SABOTAGE_COOLDOWN,
            expiresAt: 0,
          },
        };

    Object.entries(players).forEach(([id, teammate]) => {
      if (teammate.role === "impostor" && teammate.alive !== false) {
        updates[`rooms/${roomCode}/players/${id}/killCooldownEndsAt`] =
          currentTime + KILL_COOLDOWN;
      }
    });

        await update(ref(db), updates);
      } catch (error) {
        console.error("Failed to start game status:", error);
      }

      setScreen("game");
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [player?.role, room?.players, roomCode, setScreen]);

  if (!player) {
    return (
      <div className="app">
        <h1>Loading role...</h1>
      </div>
    );
  }

  const isImpostor = player.role === "impostor";
  const impostorTeammates = room?.players
    ? Object.entries(room.players)
        .filter(([id, teammate]) => id !== playerId && teammate.role === "impostor")
        .map(([, teammate]) => teammate.name)
    : [];

  return (
    <div className="app">
      <p className="eyebrow">Your Role</p>

      <h1 className={isImpostor ? "impostor-title" : "crewmate-title"}>
        {isImpostor ? "Impostor" : "Crewmate"}
      </h1>

      <div className="role-card">
        <p>
          {isImpostor
            ? "Blend in. Your tasks look real, but they do not count toward the crew win."
            : "Complete your tasks and find the impostor."}
        </p>

        {isImpostor && impostorTeammates.length > 0 && (
          <div className="progress-card">
            <h2>Your Impostor Teammates</h2>
            <p>{impostorTeammates.join(", ")}</p>
          </div>
        )}

        <h2>Your Tasks</h2>

        <div className="task-list">
          {player.tasks?.map((task, index) => (
            <div key={index} className="task-card">
              {task.text}
            </div>
          ))}
        </div>
      </div>

      <p className="waiting-text">Tasks loading in 3 seconds...</p>
    </div>
  );
}

export default RoleReveal;