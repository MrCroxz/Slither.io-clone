(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  let W = canvas.width = innerWidth;
  let H = canvas.height = innerHeight;

  window.addEventListener('resize', () => {
    W = canvas.width = innerWidth;
    H = canvas.height = innerHeight;
  });

  // Game constants
  const MAP_WIDTH = 4000;
  const MAP_HEIGHT = 4000;
  const INITIAL_BOT_COUNT = 40;
  const FOOD_TARGET = 4000;

  // Game state
  let gameStarted = false;
  let gamePaused = false;
  let playerColor = '#00ffff'; // default colour

  // Menu handling
  const menuEl = document.getElementById('menu');
  const startBtn = document.getElementById('startBtn');
  const menuHighScoreEl = document.getElementById('highScore');
  const highScoreEl = document.getElementById('status');
  const pauseEl = document.getElementById('pause');
  const resumeBtn = document.getElementById('resumeBtn');
  const mainMenuBtn = document.getElementById('mainMenuBtn');
  const currentSwatch = document.getElementById('currentSwatch');
  const swatchOptions = document.getElementById('swatchOptions');

  if (currentSwatch && swatchOptions) {
    // toggle options visibility
    currentSwatch.addEventListener('click', () => {
      swatchOptions.classList.toggle('hidden');
    });

    swatchOptions.addEventListener('click', e => {
      if (e.target.classList.contains('swatch')) {
        const col = e.target.getAttribute('data-color');
        if (col === '#000000') return;
        playerColor = col;
        // update current swatch color and highlight
        currentSwatch.style.background = col;
        currentSwatch.setAttribute('data-color', col);
        document.querySelectorAll('#swatchOptions .swatch').forEach(s => s.classList.toggle('selected', s === e.target));
        swatchOptions.classList.add('hidden');
      }
    });
    // initialize highlight
    const firstOption = swatchOptions.querySelector('.swatch');
    if (firstOption) firstOption.classList.add('selected');
  }

  // High score system
  let highScore = localStorage.getItem('highScore') ? parseInt(localStorage.getItem('highScore')) : 0;
  let currentScore = 0;

  function updateHighScoreDisplay() {
    highScoreEl.textContent = 'High Score: ' + Math.floor(highScore) + ' | Move mouse, hold to boost';
    if (menuHighScoreEl) menuHighScoreEl.textContent = 'High Score: ' + Math.floor(highScore);
  }

  function startGame() {
    // pick selected swatch color; default already in playerColor
    if (!playerColor || playerColor === '#000000') {
      playerColor = '#00ffff';
    }
    initGame();
    gameStarted = true;
    menuEl.style.display = 'none';
    pauseEl.style.display = 'none';
  }

  function togglePause() {
    if (!gameStarted) return;
    gamePaused = !gamePaused;
    pauseEl.style.display = gamePaused ? 'flex' : 'none';
  }

  function goToMenu() {
    gameStarted = false;
    gamePaused = false;
    menuEl.style.display = 'flex';
    pauseEl.style.display = 'none';
    currentScore = 0;
    document.getElementById('score').textContent = 'Score: 0';
    // Reinitialize game state
    pellets = [];
    bots = [];
    player = null;
    initGame();
  }

  startBtn.addEventListener('click', startGame);
  resumeBtn.addEventListener('click', () => togglePause());
  mainMenuBtn.addEventListener('click', goToMenu);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      togglePause();
    }
  });

  updateHighScoreDisplay();

  // Input
  let mouse = { x: W / 2, y: H / 2, down: false };
  canvas.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  canvas.addEventListener('mousedown', () => { mouse.down = true; });
  canvas.addEventListener('mouseup', () => { mouse.down = false; });

  // Snake class
  class Snake {
    constructor(x, y, isPlayer = false, size = 1, color = null) {
      this.x = x;
      this.y = y;
      this.segments = [{ x, y }];
      this.length = 60 * size;
      this.angle = 0;
      this.speed = 150;
      this.boostSpeed = 300;
      this.isBoosting = false;
      this.isPlayer = isPlayer;
      this.size = size;
      // cap thickness growth
      this.maxSize = isPlayer ? 3 : 2.5;
      if (isPlayer) {
        this.color = color || '#00ffff';
      } else {
        this.color = this.randomColor();
      }
      this.dead = false;
      this.segmentSpacing = 6;
    }

    randomColor() {
      const colors = ['#ff00ff', '#00ff00', '#ffff00', '#ff6600', '#00ccff', '#ff0066'];
      return colors[Math.floor(Math.random() * colors.length)];
    }

    update(dt) {
      if (this.dead) return;

      if (this.isPlayer) {
        const cx = W / 2;
        const cy = H / 2;
        this.angle = Math.atan2(mouse.y - cy, mouse.x - cx);
        this.isBoosting = mouse.down;
      } else {
        // Simple AI: wander and chase food
        if (Math.random() < 0.02) {
          this.angle += (Math.random() - 0.5) * 0.5;
        }
        // check nearby food
        for (let p of pellets) {
          const dx = p.x - this.x;
          const dy = p.y - this.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 200) {
            this.angle = Math.atan2(dy, dx);
            if (dist > 80) this.isBoosting = Math.random() < 0.3;
          }
        }
      }

      const speed = this.isBoosting ? this.boostSpeed : this.speed;
      this.x += Math.cos(this.angle) * speed * dt;
      this.y += Math.sin(this.angle) * speed * dt;

      // Clamp to map
      this.x = Math.max(10, Math.min(MAP_WIDTH - 10, this.x));
      this.y = Math.max(10, Math.min(MAP_HEIGHT - 10, this.y));

      // Update head
      this.segments.unshift({ x: this.x, y: this.y });

      // Trim tail
      const maxSegments = Math.max(5, Math.floor(this.length / this.segmentSpacing));
      while (this.segments.length > maxSegments) {
        this.segments.pop();
      }

      // Boost reduces length (and reduces thickness proportionally)
      if (this.isBoosting) {
        const lost = dt * 20;
        this.length = Math.max(30, this.length - lost);
        // shrink size based on the same lost amount, scaled down
        this.size = Math.max(1, this.size - lost * 0.001);
      }

      // Eat pellets
      for (let i = pellets.length - 1; i >= 0; i--) {
        const p = pellets[i];
        const dist = Math.hypot(p.x - this.x, p.y - this.y);
        if (dist < 15) {
          this.length += p.size * 2;
          // grow thicker when eating, but cap at maxSize
          this.size = Math.min(this.maxSize, this.size + p.size * 0.02);
          pellets.splice(i, 1);
        }
      }
    }

    checkCollision(others) {
      for (let other of others) {
        if (other === this || other.dead) continue;
        for (let i = 0; i < other.segments.length; i++) {
          const seg = other.segments[i];
          const dist = Math.hypot(seg.x - this.x, seg.y - this.y);
          if (dist < 10 * this.size && i > 5) {
            this.die();
            return;
          }
        }
      }
    }

    die() {
      if (this.dead) return;
      this.dead = true;
      // spawn pellets where snake died - smaller amount than its total length
      // drop only a fraction of the snake's length so not everything is recoverable
      const n = Math.max(20, Math.floor(this.length * 0.25));
      for (let i = 0; i < n; i++) {
        // pick random segment along the body
        const seg = this.segments[Math.floor(Math.random() * this.segments.length)];
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * 60;
        pellets.push({
          x: seg.x + Math.cos(angle) * r,
          y: seg.y + Math.sin(angle) * r,
          size: Math.random() < 0.1 ? 6 : 3
        });
      }
    }

    draw(ctx, camX, camY) {
      ctx.save();
      ctx.translate(W / 2 - camX, H / 2 - camY);

      // Body
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 12 * this.size;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.moveTo(this.segments[0].x, this.segments[0].y);
      for (let i = 1; i < this.segments.length; i++) {
        ctx.lineTo(this.segments[i].x, this.segments[i].y);
      }
      ctx.stroke();

      // Head
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(this.segments[0].x, this.segments[0].y, 8 * this.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  // Pellet spawning
  let pellets = [];
  let bots = [];
  let player = null;

  function spawnPellets() {
    while (pellets.length < FOOD_TARGET) {
      pellets.push({
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        size: Math.random() < 0.05 ? 6 : 3
      });
    }
  }

  function initGame() {
    pellets = [];
    bots = [];
    player = new Snake(MAP_WIDTH / 2, MAP_HEIGHT / 2, true, 1, playerColor);
    player.size = 1; // ensure starting thickness
    for (let i = 0; i < INITIAL_BOT_COUNT; i++) {
      const size = Math.random() < 0.3 ? 1.5 + Math.random() * 1 : 1;
      bots.push(new Snake(Math.random() * MAP_WIDTH, Math.random() * MAP_HEIGHT, false, size));
    }
    spawnPellets();
  }

  // Initialize game
  initGame();

  let lastTime = Date.now();

  function update() {
    if (!gameStarted || gamePaused) return;

    const now = Date.now();
    let dt = Math.min((now - lastTime) / 1000, 0.033); // cap at 30ms
    lastTime = now;

    if (!player.dead) {
      player.update(dt);
      player.checkCollision(bots);
      currentScore = player.length;
    } else {
      // Player died - update high score and auto restart
      if (currentScore > highScore) {
        highScore = currentScore;
        localStorage.setItem('highScore', highScore);
        updateHighScoreDisplay();
      }
      // Restart the game
      currentScore = 0;
      initGame();
    }

    for (let bot of bots) {
      bot.update(dt);
      bot.checkCollision([player, ...bots]);

      // Respawn dead bots
      if (bot.dead && Math.random() < 0.01) {
        const idx = bots.indexOf(bot);
        const size = Math.random() < 0.3 ? 1.5 + Math.random() * 1 : 1;
        bots[idx] = new Snake(Math.random() * MAP_WIDTH, Math.random() * MAP_HEIGHT, false, size);
      }
    }

    spawnPellets();
  }

  function draw() {
    ctx.fillStyle = '#05050a';
    ctx.fillRect(0, 0, W, H);

    const camX = player.x;
    const camY = player.y;

    // Draw pellets
    ctx.save();
    ctx.translate(W / 2 - camX, H / 2 - camY);
    for (let p of pellets) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
      g.addColorStop(0, 'rgba(0,255,200,0.9)');
      g.addColorStop(1, 'rgba(0,255,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Draw snakes
    player.draw(ctx, camX, camY);
    for (let bot of bots) {
      bot.draw(ctx, camX, camY);
    }

    // Draw HUD
    document.getElementById('score').textContent = 'Score: ' + Math.floor(player.length);
  }

  function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }

  gameLoop();
})();
