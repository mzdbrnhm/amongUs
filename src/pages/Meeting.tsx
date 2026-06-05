import { useEffect, useState } from "react";
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
  type: "meeting" | "body" | "taskWin";
  triggeredBy: string;
  timestamp: number;
};

type Room = {
  status: string;
  hostId: string;
  alert?: GameAlert | null;
  players?: Record<string, Player>;
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

  async function endMeeting() {
    await update(ref(db), {
      [`rooms/${roomCode}/status`]: "game",
      [`rooms/${roomCode}/alert`]: null,
    });
  }

  async function vote(targetId: string) {
    const currentPlayer = room?.players?.[playerId];
    if (!currentPlayer || currentPlayer.alive === false) return;

    await update(ref(db), {
      [`rooms/${roomCode}/players/${playerId}/currentVote`]: targetId,
    });
  }

  async function resolveVote() {
    if (!room?.players) return;

    const alivePlayers = Object.entries(room.players).filter(
      ([, player]) => player.alive !== false
    );

    const voteCounts: Record<string, number> = {};

    alivePlayers.forEach(([, player]) => {
      const voteTarget = player.currentVote;
      if (!voteTarget) return;
      voteCounts[voteTarget] = (voteCounts[voteTarget] ?? 0) + 1;
    });

    let highestVotes = 0;
    let topTargets: string[] = [];

    Object.entries(voteCounts).forEach(([targetId, count]) => {
      if (count > highestVotes) {
        highestVotes = count;
        topTargets = [targetId];
      } else if (count === highestVotes) {
        topTargets.push(targetId);
      }
    });

    const updates: Record<string, unknown> = {};

    Object.keys(room.players).forEach((id) => {
      updates[`rooms/${roomCode}/players/${id}/currentVote`] = null;
    });

    const noVotes = highestVotes === 0;
    const tie = topTargets.length !== 1;
    const skipped = topTargets[0] === "skip";

    if (!noVotes && !tie && !skipped) {
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
      }
    }

    updates[`rooms/${roomCode}/status`] = "game";
    updates[`rooms/${roomCode}/alert`] = null;

    await update(ref(db), updates);
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

  if (!room) {
    return (
      <div className="app">
        <h1>Loading meeting...</h1>
      </div>
    );
  }

  const players = room.players ? Object.entries(room.players) : [];
  const alivePlayers = players.filter(([, player]) => player.alive !== false);
  const currentPlayer = room.players?.[playerId];
  const amHost = room.hostId === playerId;
  const myVote = currentPlayer?.currentVote ?? null;
  const voteCount = alivePlayers.filter(([, player]) => player.currentVote).length;

  return (
    <div className="app">
      <p className="eyebrow">
        {room.alert?.type === "body" ? "Body Reported" : "Emergency Meeting"}
      </p>

      <h1>Discussion Time</h1>

      <div className="role-card">
        <p>
          {room.alert?.type === "body"
            ? `${room.alert.triggeredBy} reported a body.`
            : `${room.alert?.triggeredBy ?? "Someone"} called a meeting.`}
        </p>

        <div className="progress-card">
          <p>Votes Cast</p>
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
                className={`player-card vote-card ${myVote === id ? "selected-vote" : ""}`}
                onClick={() => vote(id)}
                disabled={!canVoteForPlayer}
              >
                <div className="player-avatar">
                  {player.name.charAt(0).toUpperCase()}
                </div>

                <div className="player-info">
                  <strong>{player.name}</strong>
                  <span>{isAlive ? "Alive" : "Dead/Ghost"}</span>
                </div>
              </button>
            );
          })}
        </div>

        <button
          className={`secondary ${myVote === "skip" ? "selected-vote" : ""}`}
          onClick={() => vote("skip")}
          disabled={currentPlayer?.alive === false}
        >
          Skip Vote
        </button>
      </div>

      {amHost ? (
        <div className="host-actions">
          <button className="start-button" onClick={resolveVote}>
            Resolve Vote
          </button>

          <button className="secondary" onClick={endMeeting}>
            Resume Without Vote
          </button>

          <button className="secondary" onClick={resetToLobby}>
            Back to Lobby / Restart
          </button>
        </div>
      ) : (
        <p className="waiting-text">Waiting for host...</p>
      )}
    </div>
  );
}

export default Meeting;