// Simple server-side bot AI: pick targets, avoid larger snakes, chase smaller
module.exports = {
  update(game, dt) {
    // ensure at least 15 bots
    const botsCount = Object.keys(game.bots).length;
    for (let i = botsCount; i < 15; i++) game.addBot();

    for (const id in game.bots) {
      const b = game.bots[id];
      if (!b) continue;
      // basic wander
      let ax = 0, ay = 0;
      // prefer nearby pellets
      const nearby = game.grid.nearby(b.x, b.y, 400);
      let bestFood = null; let bestFoodDist = Infinity;
      for (const obj of nearby) {
        if (obj.x !== undefined && obj.size !== undefined) {
          const dx = obj.x - b.x, dy = obj.y - b.y;
          const d = Math.hypot(dx, dy);
          if (d < bestFoodDist) { bestFoodDist = d; bestFood = obj; }
        }
      }
      if (bestFood) {
        b.targetAngle = Math.atan2(bestFood.y - b.y, bestFood.x - b.x);
        b.boosting = bestFoodDist > 60 && Math.random() < 0.4;
      } else {
        // roam and avoid walls
        const margin = 200;
        if (b.x < margin) b.targetAngle = 0;
        else if (b.x > game.width - margin) b.targetAngle = Math.PI;
        if (b.y < margin) b.targetAngle = Math.PI / 2;
        else if (b.y > game.height - margin) b.targetAngle = -Math.PI / 2;
        if (Math.random() < 0.01) b.targetAngle += (Math.random() - 0.5) * 1.2;
        b.boosting = false;
      }

      // avoid big snakes: steer away if a large snake is close
      const danger = game.grid.nearby(b.x, b.y, 200);
      for (const obj of danger) {
        if (obj.segments && obj.length > b.length * 1.2) {
          // steer away
          const dx = b.x - obj.x || 0.01;
          const dy = b.y - obj.y || 0.01;
          b.targetAngle = Math.atan2(dy, dx);
          b.boosting = false;
        }
      }
    }
  }
};
