import type { Screen } from "../App";

type Props = {
  setScreen: (screen: Screen) => void;
};

function Home({ setScreen }: Props) {
  return (
    <div className="app">
      <h1>Among Us IRL</h1>
      <p>Choose how you want to play</p>

      <button onClick={() => setScreen("host")}>Host Game</button>
      <button onClick={() => setScreen("join")}>Join Game</button>
    </div>
  );
}

export default Home;