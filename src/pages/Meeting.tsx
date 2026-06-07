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
  role?: "crewmate" | "impostor";
  alive?: boolean;
  tasks?: Task[];
  currentVote?: string | null;
};

type GameAlert = {
  type: "meeting" | "body" | "taskWin" | "impostorWin";
  triggeredBy: string;
  timestamp: number;
};

type MeetingResult = {
  skipped: boolean;
  ejectedName?: string;
  ejectedRole?: "crewmate" | "impostor";
  reason: string;
};

type Room = {
  status: string;
  hostId: string;
  alert?: GameAlert | null;
  players?: Record<string, Player>;
  discussionEndsAt?: number;
  meetingEndsAt?: number;
  meetingResult?: MeetingResult | null;
};

type Props = {
  roomCode: string;
  playerId: string;
  setScreen: (screen: Screen) => void;
};

const KILL_COOLDOWN = 30000;
const SABOTAGE_COOLDOWN = 60000;

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

function Meeting({ roomCode, playerId, setScreen }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [now, setNow] = useState(0);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [isConfirmingVote, setIsConfirmingVote] = useState(false);
  const resolvingVote = useRef(false);

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

      if (roomData.players?.[playerId]?.currentVote) {
        setIsConfirmingVote(false);
      }

      if (roomData.status === "game") {
        setScreen("game");
      }

      if (roomData.status === "lobby") {
        setScreen("lobby");
      }
    });

    return () => unsubscribe();
  }, [roomCode, playerId, setScreen]);

  useEffect(() => {
    const tick = () => setNow(new Date().getTime());
    tick();

    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!roomCode || !room) return;
    if (room.status !== "meeting") return;

    const currentTime = now || new Date().getTime();

    if (!room.discussionEndsAt) {
      update(ref(db), {
        [`rooms/${roomCode}/discussionEndsAt`]: currentTime + 30000,
        [`rooms/${roomCode}/meetingEndsAt`]: null,
        [`rooms/${roomCode}/meetingResult`]: null,
        [`rooms/${roomCode}/sabotage/active`]: false,
        [`rooms/${roomCode}/sabotage/type`]: null,
        [`rooms/${roomCode}/sabotage/expiresAt`]: 0,
        [`rooms/${roomCode}/sabotage/reactorHolders`]: null,
      });
      return;
    }

    if (currentTime >= room.discussionEndsAt && !room.meetingEndsAt) {
      update(ref(db), {
        [`rooms/${roomCode}/meetingEndsAt`]: currentTime + 120000,
      });
    }
  }, [room, roomCode, now]);

  function selectVote(targetId: string) {
    const currentPlayer = room?.players?.[playerId];
    if (!currentPlayer || currentPlayer.alive === false) return;
    if (currentPlayer.currentVote) return;
    if (room?.status !== "meeting") return;
    if (!room.meetingEndsAt) return;

    setSelectedVote(targetId);
  }

  async function confirmVote() {
    const currentPlayer = room?.players?.[playerId];
    if (!currentPlayer || currentPlayer.alive === false) return;
    if (currentPlayer.currentVote) return;
    if (!selectedVote) return;
    if (room?.status !== "meeting") return;
    if (!room.meetingEndsAt) return;
    if (isConfirmingVote) return;

    setIsConfirmingVote(true);

    try {
      await update(ref(db), {
        [`rooms/${roomCode}/players/${playerId}/currentVote`]: selectedVote,
      });
    } catch (error) {
      console.error("Failed to confirm vote:", error);
      setIsConfirmingVote(false);
    }
  }

  async function resolveVote() {
    if (!room?.players || resolvingVote.current) return;

    resolvingVote.current = true;

    const alivePlayers = Object.entries(room.players).filter(
      ([, player]) => player.alive !== false
    );

    const voteCounts: Record<string, number> = {};
    let submittedVotes = 0;

    alivePlayers.forEach(([, player]) => {
      const voteTarget = player.currentVote;

      if (!voteTarget) return;

      submittedVotes += 1;
      voteCounts[voteTarget] = (voteCounts[voteTarget] ?? 0) + 1;
    });

    const nonVotes = alivePlayers.length - submittedVotes;
    const skipVotes = (voteCounts.skip ?? 0) + nonVotes;

    const playerVoteCounts = Object.entries(voteCounts).filter(
      ([targetId]) => targetId !== "skip"
    );

    let highestPlayerVotes = 0;
    let topTargets: string[] = [];

    playerVoteCounts.forEach(([targetId, count]) => {
      if (count > highestPlayerVotes) {
        highestPlayerVotes = count;
        topTargets = [targetId];
      } else if (count === highestPlayerVotes) {
        topTargets.push(targetId);
      }
    });

    const updates: Record<string, unknown> = {};

    Object.keys(room.players).forEach((id) => {
      updates[`rooms/${roomCode}/players/${id}/currentVote`] = null;
    });

    const noPlayerVotes = highestPlayerVotes === 0;
    const tiedPlayerVotes = topTargets.length !== 1;
    const skipWins = skipVotes >= highestPlayerVotes;

    let meetingResult: MeetingResult = {
      skipped: true,
      reason: "No one was ejected.",
    };

    if (!noPlayerVotes && !tiedPlayerVotes && !skipWins) {
      const ejectedId = topTargets[0];
      const ejectedPlayer = room.players[ejectedId];

      if (ejectedPlayer) {
        const updatedTasks =
          ejectedPlayer.role === "crewmate"
            ? ejectedPlayer.tasks?.map((task) => {
                if (task.completed) return task;
                return generateMathTask();
              }) ?? []
            : ejectedPlayer.tasks ?? [];

        updates[`rooms/${roomCode}/players/${ejectedId}/alive`] = false;
        updates[`rooms/${roomCode}/players/${ejectedId}/tasks`] = updatedTasks;

        meetingResult = {
          skipped: false,
          ejectedName: ejectedPlayer.name,
          ejectedRole: ejectedPlayer.role,
          reason: `${ejectedPlayer.name} was ejected.`,
        };
      }
    } else if (skipWins) {
      meetingResult = {
        skipped: true,
        reason: "Skip won. No one was ejected.",
      };
    } else if (tiedPlayerVotes) {
      meetingResult = {
        skipped: true,
        reason: "Vote tied. No one was ejected.",
      };
    }

    updates[`rooms/${roomCode}/status`] = "meetingReveal";
    updates[`rooms/${roomCode}/meetingResult`] = meetingResult;
    updates[`rooms/${roomCode}/discussionEndsAt`] = null;
    updates[`rooms/${roomCode}/alert`] = null;
    updates[`rooms/${roomCode}/sabotage/active`] = false;
    updates[`rooms/${roomCode}/sabotage/type`] = null;
    updates[`rooms/${roomCode}/sabotage/expiresAt`] = 0;
    updates[`rooms/${roomCode}/sabotage/reactorHolders`] = null;

    await update(ref(db), updates);
  }

  useEffect(() => {
    if (!room || room.status !== "meeting") return;
    if (!room.players || !room.meetingEndsAt) return;
    if (resolvingVote.current) return;

    const alivePlayers = Object.values(room.players).filter(
      (player) => player.alive !== false
    );

    const voteCount = alivePlayers.filter((player) => player.currentVote).length;
    const everyoneVoted = alivePlayers.length > 0 && voteCount === alivePlayers.length;
    const timeExpired = now > 0 && now >= room.meetingEndsAt;

    if (everyoneVoted || timeExpired) {
      resolveVote();
    }
  }, [now, room]);

  useEffect(() => {
    if (!room || room.status !== "meetingReveal") return;

    const timer = window.setTimeout(() => {
      const currentTime = new Date().getTime();
      const updates: Record<string, unknown> = {
        [`rooms/${roomCode}/status`]: "game",
        [`rooms/${roomCode}/discussionEndsAt`]: null,
        [`rooms/${roomCode}/meetingEndsAt`]: null,
        [`rooms/${roomCode}/alert`]: null,
        [`rooms/${roomCode}/sabotage`]: {
          active: false,
          type: null,
          cooldownEndsAt: currentTime + SABOTAGE_COOLDOWN,
          expiresAt: 0,
        },
      };

      if (room.players) {
        Object.entries(room.players).forEach(([id, player]) => {
          if (player.role === "impostor" && player.alive !== false) {
            updates[`rooms/${roomCode}/players/${id}/killCooldownEndsAt`] =
              currentTime + KILL_COOLDOWN;
          }
        });
      }

      update(ref(db), updates);
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [room, roomCode]);

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
    updates[`rooms/${roomCode}/discussionEndsAt`] = null;
    updates[`rooms/${roomCode}/meetingEndsAt`] = null;
    updates[`rooms/${roomCode}/meetingResult`] = null;

    await update(ref(db), updates);
  }

  if (!room) {
    return (
      <div className="app">
        <h1>Loading meeting...</h1>
      </div>
    );
  }

  const players = room.players
    ? Object.entries(room.players).sort(([, playerA], [, playerB]) => {
        const aDead = playerA.alive === false;
        const bDead = playerB.alive === false;

        if (aDead === bDead) {
          return playerA.name.localeCompare(playerB.name);
        }

        return aDead ? 1 : -1;
      })
    : [];
  const alivePlayers = players.filter(([, player]) => player.alive !== false);
  const currentPlayer = room.players?.[playerId];
  const amHost = room.hostId === playerId;
  const myVote = currentPlayer?.currentVote ?? null;
  const displayedVote = myVote ?? selectedVote;
  const voteLocked = Boolean(myVote);
  const discussionActive = room.status === "meeting" && !room.meetingEndsAt;
  const votingActive = room.status === "meeting" && Boolean(room.meetingEndsAt);
  const canSelectVote = currentPlayer?.alive !== false && votingActive && !voteLocked;
  const voteCount = alivePlayers.filter(([, player]) => player.currentVote).length;
  const discussionSecondsLeft = room.discussionEndsAt
    ? Math.max(0, Math.ceil((room.discussionEndsAt - now) / 1000))
    : 30;
  const secondsLeft = room.meetingEndsAt
    ? Math.max(0, Math.ceil((room.meetingEndsAt - now) / 1000))
    : 120;

  return (
    <div className="app">
      <p className="eyebrow">
        {room.alert?.type === "body" ? "Body Reported" : "Emergency Meeting"}
      </p>

      <h1>
        {room.status === "meetingReveal"
          ? "Vote Result"
          : discussionActive
          ? "Get to the Meeting Table"
          : "Voting Time"}
      </h1>

      <div className="role-card">
        {room.status === "meetingReveal" && room.meetingResult ? (
          <div className="progress-card">
            <h2>{room.meetingResult.reason}</h2>
            {!room.meetingResult.skipped && (
              <p>
                {room.meetingResult.ejectedName} was a {room.meetingResult.ejectedRole}.
              </p>
            )}
            <p>Returning to tasks...</p>
          </div>
        ) : null}

        {room.status === "meeting" && (
          <p>
            {room.alert?.type === "body"
              ? `${room.alert.triggeredBy} reported a body.`
              : `${room.alert?.triggeredBy ?? "Someone"} called a meeting.`}
          </p>
        )}

        <div className="progress-card">
          <p>
            {room.status === "meetingReveal"
              ? "Vote Complete"
              : discussionActive
              ? `Voting starts in ${discussionSecondsLeft}s`
              : `Voting ends in ${secondsLeft}s`}
          </p>
          <strong>
            {discussionActive ? "Move to table" : `${voteCount}/${alivePlayers.length}`}
          </strong>
        </div>

        <h2>{discussionActive ? "Players" : "Vote"}</h2>

        <div className="player-list">
          {players.map(([id, player]) => {
            const isAlive = player.alive !== false;
            const canVoteForPlayer = currentPlayer?.alive !== false && isAlive;

            return (
              <button
                key={id}
                className={`player-card vote-card ${!isAlive ? "dead-player-card" : ""} ${displayedVote === id ? "selected-vote" : ""}`}
                style={
                  displayedVote === id
                    ? {
                        border: "3px solid #ff3333",
                        backgroundColor: "rgba(255, 0, 0, 0.2)",
                      }
                    : undefined
                }
                onClick={() => selectVote(id)}
                disabled={!canVoteForPlayer || !canSelectVote}
              >
                <div className="player-avatar">
                  {player.name.charAt(0).toUpperCase()}
                </div>

                <div className="player-info">
                  <strong>{player.name}</strong>
                  <span>{isAlive ? "Alive - can be voted" : "Dead/Ghost - cannot vote or be voted"}</span>
                </div>
              </button>
            );
          })}
        </div>

        <button
          className={`secondary ${displayedVote === "skip" ? "selected-vote" : ""}`}
          style={
            displayedVote === "skip"
              ? {
                  border: "3px solid #ff3333",
                  backgroundColor: "rgba(255, 0, 0, 0.2)",
                }
              : undefined
          }
          onClick={() => selectVote("skip")}
          disabled={!canSelectVote}
        >
          Skip Vote
        </button>

        <button
          onClick={confirmVote}
          disabled={discussionActive || !canSelectVote || !selectedVote || isConfirmingVote}
        >
          {voteLocked
            ? "Vote Locked"
            : isConfirmingVote
            ? "Confirming..."
            : selectedVote === "skip"
            ? "Confirm Skip"
            : selectedVote
            ? "Confirm Vote"
            : "Select a Vote"}
        </button>

        {voteLocked && <p className="waiting-text">Your vote is locked in.</p>}
      </div>

      {amHost && (
        <div className="host-actions">
          <button className="secondary" onClick={resetToLobby}>
            Back to Lobby / Restart
          </button>
        </div>
      )}

      {room.status === "meeting" ? (
        <p className="waiting-text">
          {discussionActive
            ? "Head to the meeting table. Discussion time before voting."
            : "Vote before time runs out..."}
        </p>
      ) : (
        <p className="waiting-text">Returning to game...</p>
      )}
    </div>
  );
}

export default Meeting;