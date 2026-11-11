import './style.css';
import { GameController } from './core/GameController';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error('Could not find #game-canvas element.');
}

const game = new GameController(canvas);
game.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.dispose();
  });
}

