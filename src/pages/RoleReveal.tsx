import { useEffect, useState } from "react";
import { ref, onValue } from "firebase/database";
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
};

type Props = {
  roomCode: string;
  playerId: string;
  setScreen: (screen: Screen) => void;
};

function RoleReveal({ roomCode, playerId, setScreen }: Props) {
  const [player, setPlayer] = useState<Player | null>(null);

  useEffect(() => {
    if (!roomCode || !playerId) {
      setScreen("home");
      return;
    }

    const playerRef = ref(db, `rooms/${roomCode}/players/${playerId}`);

    const unsubscribe = onValue(playerRef, (snapshot) => {
      if (snapshot.exists()) {
        setPlayer(snapshot.val());
      }
    });

    return () => unsubscribe();
  }, [roomCode, playerId, setScreen]);

  useEffect(() => {
    if (!player?.role) return;

    const timer = window.setTimeout(() => {
      setScreen("game");
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [player?.role, setScreen]);

  if (!player) {
    return (
      <div className="app">
        <h1>Loading role...</h1>
      </div>
    );
  }

  const isImpostor = player.role === "impostor";

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