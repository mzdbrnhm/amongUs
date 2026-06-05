import { useEffect, useRef, useState } from "react";
import { ref, onValue, update } from "firebase/database";
import { db } from "../firebase/firebase";
import type { Screen } from "../App";

type Task = {
  text: string;
  completed: boolean;
  type: "real" | "math";
  answer?: number;
};

type Player = {
  name: string;
  isHost: boolean;
  role: "crewmate" | "impostor";
  alive: boolean;
  meetingUsed?: boolean;
  killCooldownEndsAt?: number;
  tasks?: Task[];
};

type GameAlert = {
  type: "meeting" | "body" | "taskWin" | "impostorWin";
  triggeredBy: string;
  timestamp: number;
};

type Room = {
  status: string;
  alert?: GameAlert | null;
  players?: Record<string, Player>;
};

type Props = {
  roomCode: string;
  playerId: string;
  setScreen: (screen: Screen) => void;
};

const KILL_COOLDOWN = 30000;

function Game({ roomCode, playerId, setScreen }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [now, setNow] = useState<number>(0);
  const [activeAlert, setActiveAlert] = useState<GameAlert | null>(null);
  const lastAlertTimestamp = useRef<number | null>(null);
  const taskWinTriggered = useRef(false);
  const impostorWinTriggered = useRef(false);

  useEffect(() => {
    const updateClock = () => {
      setNow(new Date().getTime());
    };

    updateClock();

    const timer = window.setInterval(updateClock, 500);

    return () => window.clearInterval(timer);
  }, []);

  function playAlarm() {
    const audio = new Audio("/alarm.mp3");
    audio.volume = 1;
    audio.play().catch(() => {
      console.log("Audio blocked until user interacts with page.");
    });

    if (navigator.vibrate) {
      navigator.vibrate([300, 150, 300, 150, 600]);
    }
  }

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

      if (roomData.status === "meeting") {
        setScreen("meeting");
        return;
      }

      if (roomData.status === "lobby") {
        setScreen("lobby");
        return;
      }

      if (
        roomData.alert &&
        roomData.alert.timestamp !== lastAlertTimestamp.current
      ) {
        lastAlertTimestamp.current = roomData.alert.timestamp;
        setActiveAlert(roomData.alert);
        playAlarm();
      }
    });

    return () => unsubscribe();
  }, [roomCode, playerId, setScreen]);

  function generateMathTask() {
    const a = Math.floor(Math.random() * 12) + 1;
    const b = Math.floor(Math.random() * 12) + 1;

    return {
      text: `${a} + ${b}`,
      answer: a + b,
      completed: false,
      type: "math" as const,
    };
  }

  async function completeTask(index: number) {
    if (!player?.tasks) return;

    const task = player.tasks[index];
    if (task.completed) return;

    if (task.type === "math") {
      const answer = window.prompt(`Solve: ${task.text}`);

      if (Number(answer) !== task.answer) {
        alert("Wrong answer. Try again.");
        return;
      }
    }

    const updatedTasks = [...player.tasks];
    updatedTasks[index] = {
      ...task,
      completed: true,
    };

    await update(ref(db, `rooms/${roomCode}/players/${playerId}`), {
      tasks: updatedTasks,
    });
  }

  async function declareDead() {
    if (!player || player.role !== "crewmate" || !player.alive) return;

    const confirmed = window.confirm(
      "Confirm you were killed? Your unfinished real-life tasks will become math tasks."
    );

    if (!confirmed) return;

    const updatedTasks =
      player.tasks?.map((task) => {
        if (task.completed) return task;
        return generateMathTask();
      }) ?? [];

    await update(ref(db, `rooms/${roomCode}/players/${playerId}`), {
      alive: false,
      tasks: updatedTasks,
    });
  }

  async function useKillCooldown() {
    if (!player || player.role !== "impostor") return;

    await update(ref(db, `rooms/${roomCode}/players/${playerId}`), {
      killCooldownEndsAt: new Date().getTime() + KILL_COOLDOWN,
    });
  }

  async function callMeeting() {
    if (!player || player.meetingUsed) return;

    await update(ref(db), {
      [`rooms/${roomCode}/status`]: "meeting",
      [`rooms/${roomCode}/players/${playerId}/meetingUsed`]: true,
      [`rooms/${roomCode}/alert`]: {
        type: "meeting",
        triggeredBy: player.name,
        timestamp: new Date().getTime(),
      },
    });
  }

  async function reportBody() {
    if (!player) return;

    await update(ref(db), {
      [`rooms/${roomCode}/status`]: "meeting",
      [`rooms/${roomCode}/alert`]: {
        type: "body",
        triggeredBy: player.name,
        timestamp: new Date().getTime(),
      },
    });
  }

  async function resetToLobby() {
    if (!room?.players) return;

    const updates: Record<string, unknown> = {};

    Object.keys(room.players).forEach((id) => {
      updates[`rooms/${roomCode}/players/${id}/role`] = null;
      updates[`rooms/${roomCode}/players/${id}/alive`] = null;
      updates[`rooms/${roomCode}/players/${id}/tasks`] = null;
      updates[`rooms/${roomCode}/players/${id}/meetingUsed`] = null;
      updates[`rooms/${roomCode}/players/${id}/killCooldownEndsAt`] = null;
      updates[`rooms/${roomCode}/players/${id}/currentVote`] = null;
    });

    updates[`rooms/${roomCode}/status`] = "lobby";
    updates[`rooms/${roomCode}/alert`] = null;

    await update(ref(db), updates);
  }

  const tasks = player?.tasks ?? [];
  const completedCount = tasks.filter((task) => task.completed).length;

  const allCrewmateTasks = room?.players
    ? Object.values(room.players)
        .filter((p) => p.role === "crewmate")
        .flatMap((p) => p.tasks ?? [])
    : [];

  const crewCompleted = allCrewmateTasks.filter((task) => task.completed).length;
  const crewTotal = allCrewmateTasks.length;
  const crewProgress =
    crewTotal === 0 ? 0 : Math.round((crewCompleted / crewTotal) * 100);
  const crewTasksComplete = crewTotal > 0 && crewCompleted === crewTotal;

  const alivePlayers = room?.players
    ? Object.values(room.players).filter((p) => p.alive !== false)
    : [];

  const aliveCrewmates = alivePlayers.filter((p) => p.role === "crewmate").length;
  const aliveImpostors = alivePlayers.filter((p) => p.role === "impostor").length;
  const impostorsCanWin = aliveImpostors > 0 && aliveCrewmates <= aliveImpostors;

  useEffect(() => {
    if (!roomCode || !room || !player || taskWinTriggered.current) return;
    if (!crewTasksComplete) return;
    if (room.status === "crewTaskWin") return;

    taskWinTriggered.current = true;

    update(ref(db), {
      [`rooms/${roomCode}/status`]: "crewTaskWin",
      [`rooms/${roomCode}/alert`]: {
        type: "taskWin",
        triggeredBy: "Crewmates",
        timestamp: new Date().getTime(),
      },
    });
  }, [crewTasksComplete, player, room, roomCode]);

  useEffect(() => {
    if (!roomCode || !room || !player || impostorWinTriggered.current) return;
    if (!impostorsCanWin) return;
    if (room.status === "crewTaskWin" || room.status === "impostorWin") return;

    impostorWinTriggered.current = true;

    update(ref(db), {
      [`rooms/${roomCode}/status`]: "impostorWin",
      [`rooms/${roomCode}/alert`]: {
        type: "impostorWin",
        triggeredBy: "Impostors",
        timestamp: new Date().getTime(),
      },
    });
  }, [impostorsCanWin, player, room, roomCode]);

  if (!player) {
    return (
      <div className="app">
        <h1>Loading game...</h1>
      </div>
    );
  }

  const cooldownEndsAt = player.killCooldownEndsAt ?? 0;
  const cooldownLeft = Math.max(0, Math.ceil((cooldownEndsAt - now) / 1000));
  const canKill = player.role === "impostor" && cooldownLeft === 0;

  return (
    <div className="app">
      {activeAlert && (
        <div className="alert-overlay">
          <div className="alert-box">
            <h1>
              {activeAlert.type === "meeting"
                ? "🚨 Emergency Meeting"
                : activeAlert.type === "body"
                ? "🚨 Body Reported"
                : activeAlert.type === "taskWin"
                ? "✅ Crewmates Win"
                : "🔪 Impostors Win"}
            </h1>

            <p>
              {activeAlert.type === "taskWin"
                ? "All crewmate tasks are complete."
                : activeAlert.type === "impostorWin"
                ? "Only the impostors remain in control."
                : `Called by ${activeAlert.triggeredBy}`}
            </p>

            {activeAlert.type === "taskWin" || activeAlert.type === "impostorWin" ? (
              <button onClick={resetToLobby}>Back to Lobby</button>
            ) : (
              <button onClick={() => setActiveAlert(null)}>Dismiss</button>
            )}
          </div>
        </div>
      )}

      <p className="eyebrow">
        {player.role === "impostor" ? "Fake Tasks" : "Crewmate Tasks"}
      </p>

      <h1>{player.role === "impostor" ? "Blend In" : "Complete Tasks"}</h1>

      {player.role === "impostor" && (
        <div className="control-card">
          <h2>Kill Cooldown</h2>

          {canKill ? (
            <p className="kill-ready">READY TO KILL</p>
          ) : (
            <p className="cooldown-text">{cooldownLeft}s</p>
          )}

          <button
            className="kill-button"
            disabled={!canKill}
            onClick={useKillCooldown}
          >
            I Killed — Reset Cooldown
          </button>
        </div>
      )}

      <div className="progress-card">
        <p>Crewmate Task Progress</p>

        <div className="progress-bar">
          <div style={{ width: `${crewProgress}%` }} />
        </div>

        <strong>
          {crewCompleted}/{crewTotal} Tasks
        </strong>
      </div>

      {player.role === "crewmate" && player.alive && (
        <button className="kill-button" onClick={declareDead}>
          I Was Killed
        </button>
      )}

      {player.role === "crewmate" && !player.alive && (
        <div className="control-card">
          <h2>Ghost Mode</h2>
          <p>Your unfinished tasks are now digital math tasks.</p>
        </div>
      )}

      <div className="meeting-actions">
        <button
          className="meeting-button"
          disabled={player.meetingUsed}
          onClick={callMeeting}
        >
          {player.meetingUsed ? "Meeting Used" : "Call Meeting"}
        </button>

        <button className="report-button" onClick={reportBody}>
          Report Body
        </button>
      </div>

      <div className="role-card">
        <h2>
          Your Tasks {completedCount}/{tasks.length}
        </h2>

        <div className="task-list">
          {tasks.map((task, index) => (
            <button
              key={index}
              className={`task-button ${task.completed ? "task-complete" : ""}`}
              onClick={() => completeTask(index)}
              disabled={room?.status === "crewTaskWin" || room?.status === "impostorWin"}
            >
              {task.completed ? "✅ " : "⬜ "}
              {task.type === "math" ? `Solve: ${task.text}` : task.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Game;