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
  meetingEndsAt?: number;
  meetingResult?: MeetingResult | null;
};

type Props = {
  roomCode: string;
  playerId: string;
  setScreen: (screen: Screen) => void;
};

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

function Meeting({ roomCode, playerId, setScreen }: Props) {
  const [room, setRoom] = useState<Room | null>(null);
  const [now, setNow] = useState(0);
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
    if (room.meetingEndsAt) return;

    update(ref(db), {
      [`rooms/${roomCode}/meetingEndsAt`]: new Date().getTime() + 120000,
      [`rooms/${roomCode}/meetingResult`]: null,
    });
  }, [room, roomCode]);

  async function vote(targetId: string) {
    const currentPlayer = room?.players?.[playerId];
    if (!currentPlayer || currentPlayer.alive === false) return;

    await update(ref(db), {
      [`rooms/${roomCode}/players/${playerId}/currentVote`]: targetId,
    });
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
    updates[`rooms/${roomCode}/alert`] = null;

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
      update(ref(db), {
        [`rooms/${roomCode}/status`]: "game",
        [`rooms/${roomCode}/meetingEndsAt`]: null,
        [`rooms/${roomCode}/alert`]: null,
      });
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
  const voteCount = alivePlayers.filter(([, player]) => player.currentVote).length;
  const secondsLeft = room.meetingEndsAt
    ? Math.max(0, Math.ceil((room.meetingEndsAt - now) / 1000))
    : 120;

  return (
    <div className="app">
      <p className="eyebrow">
        {room.alert?.type === "body" ? "Body Reported" : "Emergency Meeting"}
      </p>

      <h1>{room.status === "meetingReveal" ? "Vote Result" : "Discussion Time"}</h1>

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
          <p>{room.status === "meeting" ? `Voting ends in ${secondsLeft}s` : "Vote Complete"}</p>
          <strong>
            {voteCount}/{alivePlayers.length}
          </strong>
        </div>

        <h2>Players</h2>

        <div className="player-list">
          {players.map(([id, player]) => {
            const isAlive = player.alive !== false;
            const canVoteForPlayer = currentPlayer?.alive !== false && isAlive;

            return (
              <button
                key={id}
                className={`player-card vote-card ${!isAlive ? "dead-player-card" : ""} ${myVote === id ? "selected-vote" : ""}`}
                onClick={() => vote(id)}
                disabled={!canVoteForPlayer || room.status !== "meeting"}
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
          className={`secondary ${myVote === "skip" ? "selected-vote" : ""}`}
          onClick={() => vote("skip")}
          disabled={currentPlayer?.alive === false || room.status !== "meeting"}
        >
          Skip Vote
        </button>
      </div>

      {amHost && (
        <div className="host-actions">
          <button className="secondary" onClick={resetToLobby}>
            Back to Lobby / Restart
          </button>
        </div>
      )}

      {room.status === "meeting" ? (
        <p className="waiting-text">Vote before time runs out...</p>
      ) : (
        <p className="waiting-text">Returning to game...</p>
      )}
    </div>
  );
}

export default Meeting;