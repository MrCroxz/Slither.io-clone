const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Game = require('./gameLogic');
const BotAI = require('./botAI');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 5000 });

const CLIENT_PATH = path.join(__dirname, '..', 'client');
app.use(express.static(CLIENT_PATH));

const PORT = process.env.PORT || 3000;

const game = new Game({ width: 5000, height: 5000 });

// spawn initial bots
for (let i = 0; i < 20; i++) game.addBot();

io.on('connection', (socket) => {
  console.log('conn', socket.id);

  socket.on('join', (data) => {
    const { name, color } = data || {};
    const snake = game.addPlayer(socket.id, name || 'Player', color || '#00ffcc');
    socket.emit('joined', { id: socket.id });
  });

  socket.on('input', (input) => {
    // input: { angle, boost }
    const s = game.players[socket.id];
    if (s) {
      s.targetAngle = typeof input.angle === 'number' ? input.angle : s.targetAngle;
      s.boosting = !!input.boost;
    }
  });

  socket.on('disconnect', () => {
    game.removePlayer(socket.id);
  });
});

// Main loop
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(100, now - last) / 1000; // seconds
  last = now;

  // update bots
  BotAI.update(game, dt);

  game.update(dt);

  // emit state (volatile)
  const snapshot = game.serialize();
  io.volatile.emit('state', snapshot);
}, 1000 / 60);

server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
