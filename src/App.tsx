import "./styles/global.css";
import Home from "./pages/Home";
import HostGame from "./pages/HostGame";
import JoinGame from "./pages/JoinGame";
import Lobby from "./pages/Lobby";
import RoleReveal from "./pages/RoleReveal";
import Game from "./pages/Game";
import Meeting from "./pages/Meeting";
import EmergencyButton from "./pages/EmergencyButton";
import { useEffect, useState } from "react";

export type Screen = "home" | "host" | "join" | "lobby" | "roleReveal" | "game" | "meeting" | "emergencyButton";

function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    const savedScreen = localStorage.getItem("amongUsScreen") as Screen | null;
    return savedScreen ?? "home";
  });
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem("amongUsRoomCode") ?? "");
  const [playerId, setPlayerId] = useState(() => localStorage.getItem("amongUsPlayerId") ?? "");

  useEffect(() => {
    localStorage.setItem("amongUsScreen", screen);
  }, [screen]);

  useEffect(() => {
    if (roomCode) {
      localStorage.setItem("amongUsRoomCode", roomCode);
    } else {
      localStorage.removeItem("amongUsRoomCode");
    }
  }, [roomCode]);

  useEffect(() => {
    if (playerId) {
      localStorage.setItem("amongUsPlayerId", playerId);
    } else {
      localStorage.removeItem("amongUsPlayerId");
    }
  }, [playerId]);

  if (["lobby", "roleReveal", "game", "meeting"].includes(screen) && (!roomCode || !playerId)) {
    return <Home setScreen={setScreen} />;
  }

  if (screen === "host") {
    return (
      <HostGame
        setScreen={setScreen}
        setRoomCode={setRoomCode}
        setPlayerId={setPlayerId}
      />
    );
  }

  if (screen === "join") {
    return (
      <JoinGame
        setScreen={setScreen}
        setRoomCode={setRoomCode}
        setPlayerId={setPlayerId}
      />
    );
  }

  if (screen === "lobby") {
    return (
      <Lobby
        setScreen={setScreen}
        roomCode={roomCode}
        playerId={playerId}
        setRoomCode={setRoomCode}
        setPlayerId={setPlayerId}
      />
    );
  }

  if (screen === "roleReveal") {
    return (
      <RoleReveal
        roomCode={roomCode}
        playerId={playerId}
        setScreen={setScreen}
      />
    );
  }

  if (screen === "game") {
    return (
      <Game
        roomCode={roomCode}
        playerId={playerId}
        setScreen={setScreen}
      />
    );
  }

  if (screen === "meeting") {
    return (
      <Meeting
        roomCode={roomCode}
        playerId={playerId}
        setScreen={setScreen}
      />
    );
  }

  if (screen === "emergencyButton") {
    return <EmergencyButton setScreen={setScreen} />;
  }

  return <Home setScreen={setScreen} />;
}

export default App;