const SIZE = 4;
const CELL_COUNT = SIZE * SIZE;
const DIRECTIONS = ['↑', '←', '↓', '→'];
const SNAKE = [64, 32, 16, 8, 1, 2, 4, 6, 0.8, 0.4, 0.2, 0.1, 0.01, 0.02, 0.04, 0.08];

export function move2048(board, direction) {
  const result = Array(CELL_COUNT).fill(0);
  let points = 0;
  for (let line = 0; line < SIZE; line++) {
    const indices = Array.from({ length: SIZE }, (_, position) => {
      const step = direction >= 2 ? SIZE - 1 - position : position;
      return direction % 2 === 0 ? step * SIZE + line : line * SIZE + step;
    });
    const tiles = indices.map((index) => board[index]).filter(Boolean);
    let target = 0;
    for (let i = 0; i < tiles.length; i++) {
      let tile = tiles[i];
      if (tile === tiles[i + 1]) {
        tile *= 2;
        points += tile;
        i++;
      }
      result[indices[target++]] = tile;
    }
  }
  return { board: result, points, changed: result.some((tile, i) => tile !== board[i]) };
}

function rateBoard(board) {
  let rating = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    const tile = board[i];
    if (!tile) {
      rating += 10;
      continue;
    }
    const power = Math.log2(tile);
    rating += SNAKE[i] * power;
    const right = i % SIZE < SIZE - 1 && board[i + 1];
    const below = board[i + SIZE];
    if (right) rating -= 1.6 * Math.abs(power - Math.log2(right));
    if (below) rating -= 1.6 * Math.abs(power - Math.log2(below));
  }
  return rating;
}

function rateNextMove(board) {
  let best = -1000; // 无法再走的盘面
  for (let direction = 0; direction < DIRECTIONS.length; direction++) {
    const move = move2048(board, direction);
    if (move.changed) best = Math.max(best, rateBoard(move.board));
  }
  return best;
}

function rateAfterSpawn(board) {
  let sum = 0;
  let empty = 0;
  for (let i = 0; i < CELL_COUNT; i++) {
    if (board[i]) continue;
    empty++;
    board[i] = 2;
    sum += 0.9 * rateNextMove(board);
    board[i] = 4;
    sum += 0.1 * rateNextMove(board);
    board[i] = 0;
  }
  return sum / empty;
}

export function choose2048Move(board) {
  let best = null;
  for (let direction = 0; direction < DIRECTIONS.length; direction++) {
    const move = move2048(board, direction);
    if (!move.changed) continue;
    // 把大方块压在左上角，并预估随机落子后还能怎么走。
    const rating = 0.24 * rateBoard(move.board) + 0.76 * rateAfterSpawn(move.board);
    if (!best || rating > best.rating) best = { ...move, direction, rating };
  }
  return best;
}

function spawnTile(board) {
  const empty = board.flatMap((tile, index) => tile ? [] : [index]);
  if (empty.length) board[empty[Math.floor(Math.random() * empty.length)]] = Math.random() < 0.9 ? 2 : 4;
}

export function mount2048(root) {
  const boardEl = root.querySelector('.game-board');
  const scoreEl = root.querySelector('#gameScore');
  const maxEl = root.querySelector('#gameMax');
  const statusEl = root.querySelector('#gameStatus');
  const play = root.querySelector('#gamePlay');
  const cells = Array.from({ length: CELL_COUNT }, () => {
    const cell = document.createElement('span');
    cell.className = 'game-tile';
    boardEl.append(cell);
    return cell;
  });
  let board;
  let score;
  let timer;
  let active = false;
  let auto = true;
  let ended = false;
  let lastDirection = '';

  function render() {
    for (const [index, cell] of cells.entries()) {
      cell.textContent = board[index] || '';
      cell.dataset.value = String(board[index]);
    }
    scoreEl.textContent = String(score);
    maxEl.textContent = String(Math.max(...board));
    play.textContent = auto ? '暂停自动' : '继续自动';
    statusEl.textContent = ended
      ? (auto ? '本局结束 · 即将开始下一局' : '本局结束 · 可重新开局')
      : auto ? `大肥鱼自动挑战 ${lastDirection}`.trim() : '手动模式 · 用方向键移动';
  }

  function reset() {
    board = Array(CELL_COUNT).fill(0);
    spawnTile(board);
    spawnTile(board);
    score = 0;
    ended = false;
    lastDirection = '';
    render();
  }

  function applyMove(move, direction) {
    if (!move.changed) return;
    board = move.board;
    score += move.points;
    spawnTile(board);
    ended = DIRECTIONS.every((_, index) => !move2048(board, index).changed);
    lastDirection = DIRECTIONS[direction];
    render();
  }

  function schedule() {
    clearTimeout(timer);
    if (!active || !auto) return;
    timer = setTimeout(() => {
      if (ended) reset();
      else {
        const move = choose2048Move(board);
        applyMove(move, move.direction);
      }
      schedule();
    }, ended ? 4500 : 900);
  }

  play.onclick = () => {
    auto = !auto;
    render();
    schedule();
  };
  root.querySelector('#gameReset').onclick = () => {
    reset();
    schedule();
  };
  const arrowKeys = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
  document.addEventListener('keydown', (event) => {
    if (!active || auto || ended) return;
    const direction = arrowKeys.indexOf(event.key);
    if (direction === -1) return;
    event.preventDefault();
    applyMove(move2048(board, direction), direction);
  });
  reset();

  return (show) => {
    if (active === show) return;
    active = show;
    root.hidden = !show;
    schedule();
  };
}
