import "./styles/global.css";
import Home from "./pages/Home";
import HostGame from "./pages/HostGame";
import JoinGame from "./pages/JoinGame";
import Lobby from "./pages/Lobby";
import RoleReveal from "./pages/RoleReveal";
import Game from "./pages/Game";
import Meeting from "./pages/Meeting";
import { useState } from "react";

export type Screen = "home" | "host" | "join" | "lobby" | "roleReveal" | "game" | "meeting";

function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [roomCode, setRoomCode] = useState("");
  const [playerId, setPlayerId] = useState("");

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

  return <Home setScreen={setScreen} />;
}

export default App;