/*
  Server-side game logic: manages snakes, pellets, collisions, pooling, and spatial grid
*/
const { randomBetween, dist } = (() => ({
  randomBetween: (a, b) => a + Math.random() * (b - a),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
}))();

class Pellet {
  constructor(x = 0, y = 0, size = 2) {
    this.x = x; this.y = y; this.size = size; this.alive = true;
  }
}

class ObjectPool {
  constructor(createFn) { this.createFn = createFn; this.pool = []; }
  acquire(...args) { return this.pool.pop() || this.createFn(...args); }
  release(obj) { this.pool.push(obj); }
}

class SpatialGrid {
  constructor(width, height, cellSize = 200) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cells = new Map();
  }
  _key(cx, cy) { return cx + ',' + cy; }
  clear() { this.cells.clear(); }
  add(x, y, item) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    const key = this._key(cx, cy);
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key).push(item);
  }
  nearby(x, y, radius) {
    const mincx = Math.floor((x - radius) / this.cellSize);
    const maxcx = Math.floor((x + radius) / this.cellSize);
    const mincy = Math.floor((y - radius) / this.cellSize);
    const maxcy = Math.floor((y + radius) / this.cellSize);
    const out = [];
    for (let cx = mincx; cx <= maxcx; cx++) {
      for (let cy = mincy; cy <= maxcy; cy++) {
        const key = this._key(cx, cy);
        if (this.cells.has(key)) out.push(...this.cells.get(key));
      }
    }
    return out;
  }
}

class Snake {
  constructor(id, name, color, x, y, isBot = false) {
    this.id = id; this.name = name; this.color = color;
    this.x = x; this.y = y; this.segments = [];
    this.speed = 120; this.baseSpeed = 120; this.boostSpeed = 260;
    this.length = 60; // logical length (number of segments)
    this.segmentSpacing = 6;
    this.targetAngle = 0; this.boosting = false;
    this.isBot = isBot; this.dead = false; this.lastGrow = 0;
    // initialize segments
    for (let i = 0; i < Math.floor(this.length / this.segmentSpacing); i++) {
      this.segments.push({ x: x - i * this.segmentSpacing, y });
    }
  }
  head() { return this.segments[0]; }
}

class Game {
  constructor({ width = 5000, height = 5000 }) {
    this.width = width; this.height = height;
    this.players = {}; // socketId -> Snake
    this.bots = {};
    this.snakes = {}; // id -> Snake
    this.pellets = [];
    this.pelletPool = new ObjectPool(() => new Pellet());
    this.grid = new SpatialGrid(width, height, 200);
    this.minPellets = 1500;
    this.nextId = 1;
    this.ensurePellets();
  }

  addPlayer(socketId, name, color) {
    const x = randomBetween(200, this.width - 200);
    const y = randomBetween(200, this.height - 200);
    const id = 'p_' + socketId;
    const s = new Snake(id, name, color, x, y, false);
    this.players[socketId] = s;
    this.snakes[id] = s;
    return s;
  }

  removePlayer(socketId) {
    const s = this.players[socketId];
    if (!s) return;
    this.onSnakeDeath(s);
    delete this.snakes[s.id];
    delete this.players[socketId];
  }

  addBot() {
    const x = randomBetween(200, this.width - 200);
    const y = randomBetween(200, this.height - 200);
    const id = 'b_' + (this.nextId++);
    const s = new Snake(id, 'Bot' + id.slice(2), '#ff66cc', x, y, true);
    this.bots[id] = s; this.snakes[id] = s;
    return s;
  }

  spawnPellet(x, y, size) {
    const p = this.pelletPool.acquire();
    p.x = x; p.y = y; p.size = size || (Math.random() < 0.05 ? 6 : 2); p.alive = true;
    this.pellets.push(p);
    return p;
  }

  ensurePellets() {
    while (this.pellets.length < this.minPellets) {
      this.spawnPellet(randomBetween(0, this.width), randomBetween(0, this.height), Math.random() < 0.05 ? 6 : 2);
    }
  }

  update(dt) {
    this.grid.clear();
    // add pellets to grid
    for (const p of this.pellets) this.grid.add(p.x, p.y, p);

    // move snakes
    for (const id in this.snakes) {
      const s = this.snakes[id];
      if (s.dead) continue;
      const speed = s.boosting ? s.boostSpeed : s.baseSpeed;
      const vx = Math.cos(s.targetAngle) * speed * dt;
      const vy = Math.sin(s.targetAngle) * speed * dt;
      s.x += vx; s.y += vy;
      // clamp to map
      s.x = Math.max(0, Math.min(this.width, s.x));
      s.y = Math.max(0, Math.min(this.height, s.y));

      // add head position
      s.segments.unshift({ x: s.x, y: s.y });
      // trimming
      const targetSegments = Math.max(6, Math.floor(s.length / s.segmentSpacing));
      while (s.segments.length > targetSegments) s.segments.pop();

      // pellet collision
      const nearby = this.grid.nearby(s.x, s.y, 40);
      for (const obj of nearby) {
        if (obj instanceof Pellet && obj.alive) {
          if (dist(s.head(), obj) < 12 + obj.size) {
            obj.alive = false;
            this.pelletPool.release(obj);
            const idx = this.pellets.indexOf(obj);
            if (idx >= 0) this.pellets.splice(idx, 1);
            s.length += obj.size * 1.5; // grow
          }
        }
      }

      // check collisions with other snakes bodies
      const others = this.grid.nearby(s.x, s.y, 60);
      for (const o of others) {
        if (o === s) continue;
        if (o.segments) {
          for (let i = 0; i < o.segments.length; i++) {
            const seg = o.segments[i];
            if (i < 6 && o === s) continue; // skip own head vicinity
            if (dist(s.head(), seg) < 8) {
              // s dies
              this.onSnakeDeath(s);
            }
          }
        }
      }

      // boost reduces length slowly
      if (s.boosting) {
        s.length = Math.max(10, s.length - dt * 6);
      }

      // re-add snake segments to grid for others to query
      for (const seg of s.segments) this.grid.add(seg.x, seg.y, s);
    }

    // ensure pellet count
    this.ensurePellets();
  }

  onSnakeDeath(s) {
    if (s.dead) return;
    s.dead = true;
    // convert snake mass into pellets
    const pieces = Math.max(20, Math.floor(s.length / 3));
    for (let i = 0; i < pieces; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 40;
      this.spawnPellet(s.x + Math.cos(angle) * r, s.y + Math.sin(angle) * r, Math.random() < 0.1 ? 6 : 2);
    }
    // remove from active snakes (keep object for simplicity)
    if (s.isBot) delete this.bots[s.id];
    else {
      // if a player, keep until they reconnect or removed
    }
    delete this.snakes[s.id];
  }

  serialize() {
    // produce lightweight snapshot
    const snakes = [];
    for (const id in this.snakes) {
      const s = this.snakes[id];
      snakes.push({ id: s.id, name: s.name, color: s.color, segments: s.segments.slice(0, 60).map(p => ({ x: p.x, y: p.y })), dead: !!s.dead, length: Math.floor(s.length) });
    }
    const pellets = this.pellets.map(p => ({ x: p.x, y: p.y, size: p.size }));
    return { width: this.width, height: this.height, snakes, pellets };
  }
}

module.exports = Game;
