(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  let W = canvas.width = innerWidth; let H = canvas.height = innerHeight;

  window.addEventListener('resize', () => { W = canvas.width = innerWidth; H = canvas.height = innerHeight; });

  const stateBuffer = [];
  let localInput = { angle: 0, boost: false };
  let mouse = { x: 0, y: 0, down: false };
  let camera = { x: 2500, y: 2500, lx: 2500, ly: 2500 };
  let ownId = null;

  // input handling
  canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY;
  });
  canvas.addEventListener('mousedown', () => { mouse.down = true; });
  canvas.addEventListener('mouseup', () => { mouse.down = false; });

  // send input at 60hz
  setInterval(() => {
    // compute angle relative to screen center
    const cx = W / 2, cy = H / 2;
    localInput.angle = Math.atan2(mouse.y - cy, mouse.x - cx);
    localInput.boost = mouse.down;
    net.sendInput(localInput);
  }, 1000 / 60);

  // receive state
  let latestState = null;
  net.onState((s) => {
    latestState = s;
    stateBuffer.push({ t: Date.now(), s });
    while (stateBuffer.length > 6) stateBuffer.shift();
  });

  net.onJoined((d) => {
    // server returns socket id; player snake id is 'p_' + socketId
    ownId = 'p_' + d.id;
    UI.setStatus('Playing!');
  });

  // auto-join on page load with random name and color
  function autoJoin() {
    const adjectives = ['Swift', 'Clever', 'Bold', 'Fierce', 'Mystic', 'Silent', 'Quick', 'Agile'];
    const animals = ['Viper', 'Cobra', 'Python', 'Adder', 'Boa', 'Mamba', 'Dragon', 'Serpent'];
    const name = adjectives[Math.floor(Math.random() * adjectives.length)] + ' ' + animals[Math.floor(Math.random() * animals.length)];
    const colors = ['#00ffcc', '#ff00ff', '#00ff00', '#ffff00', '#ff6600', '#00ccff', '#ff0066', '#66ff00'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    net.connect(name, color);
    UI.setStatus('Connecting...');
  }

  // auto-join when network is ready
  setTimeout(autoJoin, 100);


  function lerp(a, b, t) { return a + (b - a) * t; }

  function draw() {
    requestAnimationFrame(draw);
    // clear
    ctx.fillStyle = '#05050a'; ctx.fillRect(0, 0, W, H);

    if (!latestState) return;

    // camera: follow your own snake if present, otherwise fallback to the first snake
    let mySnake = null;
    if (ownId) mySnake = latestState.snakes.find(x => x.id === ownId);
    if (!mySnake) mySnake = latestState.snakes.find(x => x.id && x.name);
    if (mySnake && mySnake.segments && mySnake.segments[0]) {
      const hx = mySnake.segments[0].x; const hy = mySnake.segments[0].y;
      camera.lx = lerp(camera.lx, hx, 0.12);
      camera.ly = lerp(camera.ly, hy, 0.12);
    }

    // transform
    ctx.save();
    const scale = 1; // could scale with zoom
    ctx.translate(W / 2 - camera.lx * scale, H / 2 - camera.ly * scale);

    // draw pellets
    for (const p of latestState.pellets) {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 6);
      g.addColorStop(0, 'rgba(180,240,255,0.95)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }

    // draw snakes
    for (const s of latestState.snakes) {
      // draw body with glow
      ctx.beginPath();
      for (let i = 0; i < s.segments.length; i++) {
        const p = s.segments[i];
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.lineWidth = 12;
      ctx.strokeStyle = s.color || '#88ffcc';
      ctx.shadowColor = s.color || '#88ffcc';
      ctx.shadowBlur = 18;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.shadowBlur = 0;

      // head
      if (s.segments[0]) {
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(s.segments[0].x, s.segments[0].y, 9, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.restore();

    // HUD
    // show own score if we have ownId
    let score = 0;
    if (ownId) {
      const s = latestState.snakes.find(x => x.id === ownId);
      if (s) score = s.length || 0;
      else score = 0;
    } else {
      if (latestState.snakes[0]) score = latestState.snakes[0].length || 0;
    }
    UI.setScore(score);
  }

  draw();
})();
