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
  killCooldownEndsAt?: number;
  tasks?: Task[];
};

type GameAlert = {
  type: "meeting" | "body" | "taskWin" | "impostorWin";
  triggeredBy: string;
  timestamp: number;
};

type Sabotage = {
  active: boolean;
  type: "o2" | "reactor" | "freeze" | null;
  cooldownEndsAt: number;
  expiresAt: number;
  codeA?: string;
  codeB?: string;
  fixedA?: boolean;
  fixedB?: boolean;
  reactorHolders?: Record<string, boolean>;
  freezeTargetId?: string;
  freezeTargetName?: string;
};

type Room = {
  status: string;
  alert?: GameAlert | null;
  players?: Record<string, Player>;
  sabotage?: Sabotage | null;
};

type Props = {
  roomCode: string;
  playerId: string;
  setScreen: (screen: Screen) => void;
};

const KILL_COOLDOWN = 30000;
const SABOTAGE_COOLDOWN = 20000;
const LONG_SABOTAGE_DURATION = 90000;
const FREEZE_DURATION = 30000;

function Game({ roomCode, playerId, setScreen }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [now, setNow] = useState<number>(0);
  const [activeAlert, setActiveAlert] = useState<GameAlert | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const [isChoosingFreezeTarget, setIsChoosingFreezeTarget] = useState(false);
  const lastAlertTimestamp = useRef<number | null>(null);
  const lastFreezeAlarmExpiresAt = useRef<number | null>(null);
  const taskWinTriggered = useRef(false);
  const impostorWinTriggered = useRef(false);
  const sabotageWinTriggered = useRef(false);

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

      const currentPlayer = roomData.players?.[playerId] ?? null;

      if (
        roomData.status === "game" &&
        currentPlayer?.role === "impostor" &&
        !currentPlayer.killCooldownEndsAt
      ) {
        update(ref(db, `rooms/${roomCode}/players/${playerId}`), {
          killCooldownEndsAt: new Date().getTime() + KILL_COOLDOWN,
        });
      }

      if (
        roomData.status === "game" &&
        currentPlayer?.role === "impostor" &&
        !roomData.sabotage
      ) {
        update(ref(db, `rooms/${roomCode}/sabotage`), {
          active: false,
          type: null,
          cooldownEndsAt: new Date().getTime() + SABOTAGE_COOLDOWN,
          expiresAt: 0,
        });
      }

      if (roomData.status === "meeting") {
        setIsReporting(false);
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

      const activeFreeze = roomData.sabotage?.active === true && roomData.sabotage?.type === "freeze";
      const isFrozenPlayer = roomData.sabotage?.freezeTargetId === playerId;
      const freezeExpiresAt = roomData.sabotage?.expiresAt ?? null;

      if (
        activeFreeze &&
        isFrozenPlayer &&
        freezeExpiresAt &&
        freezeExpiresAt !== lastFreezeAlarmExpiresAt.current
      ) {
        lastFreezeAlarmExpiresAt.current = freezeExpiresAt;
        playAlarm();
      }
    });

    return () => unsubscribe();
  }, [roomCode, playerId, setScreen]);

  function getRandomNumber(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function generateMathTask() {
    const template = getRandomNumber(1, 5);

    let text = "";
    let answer = 0;

    if (template === 1) {
      const a = getRandomNumber(4, 12);
      const b = getRandomNumber(2, 9);
      const c = getRandomNumber(3, 10);
      const d = getRandomNumber(2, 6);
      const e = getRandomNumber(1, 9);

      text = `${a} + ${b} × ${c} - (${d} + ${e})`;
      answer = a + b * c - (d + e);
    }

    if (template === 2) {
      const a = getRandomNumber(2, 8);
      const b = getRandomNumber(3, 9);
      const c = getRandomNumber(2, 6);
      const d = getRandomNumber(5, 14);
      const e = getRandomNumber(1, 8);

      text = `(${a} + ${b}) × ${c} - ${d} + ${e}`;
      answer = (a + b) * c - d + e;
    }

    if (template === 3) {
      const b = getRandomNumber(2, 9);
      const c = getRandomNumber(2, 8);
      const d = getRandomNumber(2, 6);
      const e = getRandomNumber(3, 10);
      const a = b * c;

      text = `${a} ÷ ${b} + ${d} × (${e} - ${c})`;
      answer = a / b + d * (e - c);
    }

    if (template === 4) {
      const a = getRandomNumber(2, 6);
      const b = getRandomNumber(2, 5);
      const c = getRandomNumber(3, 12);
      const d = getRandomNumber(1, 8);
      const e = getRandomNumber(2, 7);

      text = `${a} × (${b} + ${c}) - ${d} × ${e}`;
      answer = a * (b + c) - d * e;
    }

    if (template === 5) {
      const a = getRandomNumber(10, 25);
      const b = getRandomNumber(2, 6);
      const c = getRandomNumber(2, 9);
      const d = getRandomNumber(1, 5);
      const e = getRandomNumber(2, 6);

      text = `${a} - (${b} × ${c}) + ${d} × ${e}`;
      answer = a - b * c + d * e;
    }

    return {
      text,
      answer,
      completed: false,
      type: "math" as const,
    };
  }

  async function completeTask(index: number) {
    if (!player?.tasks) return;

    const task = player.tasks[index];
    if (task.completed) return;

    if (task.type === "math") {
      const answer = window.prompt(`Solve using PEMDAS:\n${task.text}`);

      if (answer === null) return;

      if (Number(answer.trim()) !== task.answer) {
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


  async function reportBody() {
    if (!player || isReporting) return;
    if (!player.alive) return;
    if (room?.status !== "game") return;

    setIsReporting(true);
    playAlarm();

    try {
      await update(ref(db), {
        [`rooms/${roomCode}/status`]: "meeting",
        [`rooms/${roomCode}/alert`]: {
          type: "body",
          triggeredBy: player.name,
          timestamp: new Date().getTime(),
        },
        [`rooms/${roomCode}/meetingEndsAt`]: null,
        [`rooms/${roomCode}/meetingResult`]: null,
        [`rooms/${roomCode}/sabotage/active`]: false,
      });
    } catch (error) {
      console.error(error);
      setIsReporting(false);
    }
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
    updates[`rooms/${roomCode}/sabotage`] = null;

    await update(ref(db), updates);
  }

  function makeFiveDigitCode() {
    return String(getRandomNumber(10000, 99999));
  }

  async function startSabotage(type: "o2" | "reactor" | "freeze", freezeTargetId?: string) {
    if (!player || player.role !== "impostor") return;
    if (room?.status !== "game") return;

    const currentSabotage = room?.sabotage;
    const cooldownEndsAt = currentSabotage?.cooldownEndsAt ?? 0;

    if (currentSabotage?.active) return;
    if (now < cooldownEndsAt) return;

    const freezeTarget = freezeTargetId && room?.players ? room.players[freezeTargetId] : null;

    if (type === "freeze" && (!freezeTargetId || !freezeTarget || freezeTarget.alive === false)) {
      return;
    }

    const duration = type === "freeze" ? FREEZE_DURATION : LONG_SABOTAGE_DURATION;
    const expiresAt = new Date().getTime() + duration;

    const sabotage: Sabotage = {
      active: true,
      type,
      cooldownEndsAt: type === "freeze" ? new Date().getTime() + SABOTAGE_COOLDOWN : 0,
      expiresAt,
    };

    if (type === "o2") {
      sabotage.codeA = makeFiveDigitCode();
      sabotage.codeB = makeFiveDigitCode();
      sabotage.fixedA = false;
      sabotage.fixedB = false;
    }

    if (type === "reactor") {
      sabotage.reactorHolders = {};
    }

    if (type === "freeze" && freezeTargetId && freezeTarget) {
      sabotage.freezeTargetId = freezeTargetId;
      sabotage.freezeTargetName = freezeTarget.name;
    }

    if (type !== "freeze") {
      playAlarm();
    }

    await update(ref(db), {
      [`rooms/${roomCode}/sabotage`]: sabotage,
    });

    setIsChoosingFreezeTarget(false);
  }

  async function clearSabotage(startCooldown = true) {
    await update(ref(db), {
      [`rooms/${roomCode}/sabotage/active`]: false,
      [`rooms/${roomCode}/sabotage/type`]: null,
      [`rooms/${roomCode}/sabotage/cooldownEndsAt`]: startCooldown
        ? new Date().getTime() + SABOTAGE_COOLDOWN
        : room?.sabotage?.cooldownEndsAt ?? 0,
      [`rooms/${roomCode}/sabotage/expiresAt`]: 0,
      [`rooms/${roomCode}/sabotage/reactorHolders`]: null,
      [`rooms/${roomCode}/sabotage/freezeTargetId`]: null,
      [`rooms/${roomCode}/sabotage/freezeTargetName`]: null,
    });
  }

  async function submitO2Code(location: "A" | "B") {
    if (!room?.sabotage || room.sabotage.type !== "o2") return;
    if (!player || !player.alive) return;

    const correctCode = location === "A" ? room.sabotage.codeA : room.sabotage.codeB;
    const locationName = location === "A" ? "Camper" : "Bathroom";
    const answer = window.prompt(`Enter ${locationName} O2 code:`);

    if (answer === null) return;

    if (answer.trim() !== correctCode) {
      alert("Incorrect O2 code.");
      return;
    }

    const updates: Record<string, unknown> = {};
    updates[`rooms/${roomCode}/sabotage/fixed${location}`] = true;

    const otherFixed = location === "A" ? room.sabotage.fixedB : room.sabotage.fixedA;
    if (otherFixed) {
      updates[`rooms/${roomCode}/sabotage/active`] = false;
      updates[`rooms/${roomCode}/sabotage/type`] = null;
      updates[`rooms/${roomCode}/sabotage/cooldownEndsAt`] = new Date().getTime() + SABOTAGE_COOLDOWN;
      updates[`rooms/${roomCode}/sabotage/expiresAt`] = 0;
    }

    await update(ref(db), updates);
  }

  async function setReactorHolding(isHolding: boolean) {
    if (!room?.sabotage || room.sabotage.type !== "reactor") return;
    if (!player || !player.alive) return;

    await update(ref(db), {
      [`rooms/${roomCode}/sabotage/reactorHolders/${playerId}`]: isHolding ? true : null,
    });
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
  const impostorsEliminated = room?.status === "game" && aliveCrewmates > 0 && aliveImpostors === 0;
  const crewmatesCanWin = crewTasksComplete || impostorsEliminated;

  const sabotage = room?.sabotage ?? null;
  const sabotageActive = sabotage?.active === true;
  const shouldShowSabotageOverlay =
    sabotageActive &&
    sabotage &&
    (sabotage.type !== "freeze" || sabotage.freezeTargetId === playerId);
  const sabotageSecondsLeft = sabotage?.expiresAt
    ? Math.max(0, Math.ceil((sabotage.expiresAt - now) / 1000))
    : 0;
  const sabotageCooldownLeft = sabotage?.cooldownEndsAt
    ? Math.max(0, Math.ceil((sabotage.cooldownEndsAt - now) / 1000))
    : 0;
  const sabotageReady = !sabotageActive && sabotageCooldownLeft === 0;
  const reactorHolderCount = sabotage?.reactorHolders
    ? Object.values(sabotage.reactorHolders).filter(Boolean).length
    : 0;

  useEffect(() => {
    if (!roomCode || !room || !player || taskWinTriggered.current) return;
    if (!crewmatesCanWin) return;
    if (room.status === "crewTaskWin" || room.status === "impostorWin") return;

    taskWinTriggered.current = true;

    update(ref(db), {
      [`rooms/${roomCode}/status`]: "crewTaskWin",
      [`rooms/${roomCode}/alert`]: {
        type: "taskWin",
        triggeredBy: "Crewmates",
        timestamp: new Date().getTime(),
      },
    });
  }, [crewmatesCanWin, player, room, roomCode]);

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

  useEffect(() => {
    if (!roomCode || !room || !player || sabotageWinTriggered.current) return;
    if (!sabotageActive) return;
    if (sabotage?.type !== "o2" && sabotage?.type !== "reactor") return;
    if (sabotageSecondsLeft > 0) return;
    if (room.status === "crewTaskWin" || room.status === "impostorWin") return;

    sabotageWinTriggered.current = true;

    update(ref(db), {
      [`rooms/${roomCode}/status`]: "impostorWin",
      [`rooms/${roomCode}/alert`]: {
        type: "impostorWin",
        triggeredBy: "Sabotage",
        timestamp: new Date().getTime(),
      },
      [`rooms/${roomCode}/sabotage/active`]: false,
    });
  }, [sabotageActive, sabotage?.type, sabotageSecondsLeft, player, room, roomCode]);

  useEffect(() => {
    if (!roomCode || !sabotageActive) return;
    if (sabotage?.type !== "freeze") return;
    if (sabotageSecondsLeft > 0) return;

    clearSabotage(false);
  }, [roomCode, sabotageActive, sabotage?.type, sabotageSecondsLeft]);

  useEffect(() => {
    if (!roomCode || !sabotageActive) return;
    if (sabotage?.type !== "reactor") return;
    if (reactorHolderCount < 2) return;

    clearSabotage();
  }, [roomCode, sabotageActive, sabotage?.type, reactorHolderCount]);

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
                ? "Crewmates completed their objective or eliminated the impostor."
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

      {shouldShowSabotageOverlay && sabotage && (
        <div className="alert-overlay sabotage-overlay">
          <div className="alert-box">
            <h1>
              {sabotage.type === "o2"
                ? "⚠ O2 Sabotage"
                : sabotage.type === "reactor"
                ? "☢ Reactor"
                : "❄ Freeze"}
            </h1>

            <p>
              {sabotage.type === "o2"
                ? "Emergency button disabled. Head to Camper and Bathroom."
                : sabotage.type === "reactor"
                ? "Emergency button disabled. Head to Shop and Cornhole. Two crewmates must hold the reactor."
                : "You have been frozen. Do not move."}
            </p>

            <h2>{sabotageSecondsLeft}s</h2>

            {sabotage.type === "o2" && player.alive && (
              <div className="meeting-actions">
                <button
                  className={sabotage.fixedA ? "secondary" : "start-button"}
                  disabled={sabotage.fixedA}
                  onClick={() => submitO2Code("A")}
                >
                  {sabotage.fixedA ? "Camper Fixed" : `Camper Code: ${sabotage.codeA}`}
                </button>

                <button
                  className={sabotage.fixedB ? "secondary" : "start-button"}
                  disabled={sabotage.fixedB}
                  onClick={() => submitO2Code("B")}
                >
                  {sabotage.fixedB ? "Bathroom Fixed" : `Bathroom Code: ${sabotage.codeB}`}
                </button>
              </div>
            )}

            {sabotage.type === "reactor" && player.alive && (
              <div className="meeting-actions">
                <p>{reactorHolderCount}/2 holding reactor at Shop and Cornhole</p>
                <button
                  className="start-button"
                  onPointerDown={() => setReactorHolding(true)}
                  onPointerUp={() => setReactorHolding(false)}
                  onPointerLeave={() => setReactorHolding(false)}
                  onTouchEnd={() => setReactorHolding(false)}
                >
                  Hold Reactor at Shop/Cornhole
                </button>
              </div>
            )}

            {sabotage.type === "freeze" && sabotage.freezeTargetId === playerId && player.alive && (
              <p className="kill-ready">DO NOT MOVE</p>
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

          <div className="sabotage-menu">
            <h2>Sabotage</h2>
            {!sabotageReady && (
              <p>
                {sabotageActive
                  ? "Sabotage active"
                  : `Cooldown ${sabotageCooldownLeft}s`}
              </p>
            )}

            <button disabled={!sabotageReady} onClick={() => startSabotage("o2")}>
              O2
            </button>
            <button disabled={!sabotageReady} onClick={() => startSabotage("reactor")}>
              Reactor
            </button>
            <button
              disabled={!sabotageReady}
              onClick={() => setIsChoosingFreezeTarget((current) => !current)}
            >
              Freeze
            </button>

            {isChoosingFreezeTarget && (
              <div className="meeting-actions">
                <p>Choose one player to freeze:</p>
                {room?.players &&
                  Object.entries(room.players)
                    .filter(([, target]) => target.alive !== false && target.role === "crewmate")
                    .map(([targetId, target]) => (
                      <button
                        key={targetId}
                        className="secondary"
                        disabled={!sabotageReady}
                        onClick={() => startSabotage("freeze", targetId)}
                      >
                        {target.name}
                      </button>
                    ))}
              </div>
            )}
          </div>
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

      {player.alive && (
        <div className="meeting-actions">
          <button
            className="report-button"
            onClick={reportBody}
            disabled={isReporting || room?.status !== "game"}
          >
            {isReporting ? "Reporting..." : "Report Body"}
          </button>
        </div>
      )}

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
              {task.type === "math" ? `PEMDAS: ${task.text}` : task.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Game;