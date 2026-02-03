#!/usr/bin/env node
/**
 * Production Lag Diagnostic Tool
 * Run this while playing to identify lag sources
 */

const WebSocket = require('ws');

const WS_URL = 'wss://dungeon-linkserver-production.up.railway.app';

// Tracking variables
let connected = false;
let runId = null;
let lastStateUpdate = null;
let stateUpdateCount = 0;
let stateUpdateGaps = [];
let pingsSent = 0;
let pongsReceived = 0;
let pingLatencies = [];
let pendingPing = null;
let messageCount = 0;
let messageSizes = [];
let largeMessages = [];
let startTime = Date.now();

// Gap threshold - anything over this is considered a lag spike (ms)
const LAG_THRESHOLD = 100; // 100ms = 2 missed updates at 20 tick/sec

function formatTime(ms) {
  return new Date(ms).toISOString().substr(11, 12);
}

function log(msg) {
  console.log(`[${formatTime(Date.now())}] ${msg}`);
}

function logWarning(msg) {
  console.log(`[${formatTime(Date.now())}] ⚠️  ${msg}`);
}

function logError(msg) {
  console.log(`[${formatTime(Date.now())}] ❌ ${msg}`);
}

function logSuccess(msg) {
  console.log(`[${formatTime(Date.now())}] ✓ ${msg}`);
}

// Connect to production
log('Connecting to production WebSocket...');
log(`URL: ${WS_URL}`);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  connected = true;
  logSuccess('Connected to production server');

  // Create a test run to receive state updates
  log('Creating diagnostic run...');
  ws.send(JSON.stringify({
    type: 'CREATE_RUN',
    playerName: 'LagDiagnostic',
    classId: 'warrior'
  }));

  // Start ping interval
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      pendingPing = Date.now();
      pingsSent++;
      ws.send(JSON.stringify({ type: 'PING' }));
    }
  }, 2000); // Ping every 2 seconds
});

ws.on('message', (data) => {
  const now = Date.now();
  const size = data.length;
  messageCount++;
  messageSizes.push(size);

  // Track large messages
  if (size > 10000) {
    largeMessages.push({ time: now, size, elapsed: now - startTime });
  }

  try {
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case 'RUN_CREATED':
        runId = message.runId;
        logSuccess(`Run created: ${runId}`);
        log('Now monitoring state updates. Play the game in your browser!');
        log('-----------------------------------------------------------');
        lastStateUpdate = now;
        break;

      case 'STATE_UPDATE':
        stateUpdateCount++;

        if (lastStateUpdate) {
          const gap = now - lastStateUpdate;
          stateUpdateGaps.push(gap);

          // Log lag spikes
          if (gap > LAG_THRESHOLD) {
            logWarning(`STATE_UPDATE gap: ${gap}ms (expected ~50ms)`);
          }

          // Periodic status every 100 updates (~5 seconds)
          if (stateUpdateCount % 100 === 0) {
            const recentGaps = stateUpdateGaps.slice(-100);
            const avgGap = recentGaps.reduce((a, b) => a + b, 0) / recentGaps.length;
            const maxGap = Math.max(...recentGaps);
            const minGap = Math.min(...recentGaps);
            const lagSpikes = recentGaps.filter(g => g > LAG_THRESHOLD).length;

            log(`Updates: ${stateUpdateCount} | Avg gap: ${avgGap.toFixed(1)}ms | Range: ${minGap}-${maxGap}ms | Spikes: ${lagSpikes}`);
          }
        }

        lastStateUpdate = now;
        break;

      case 'PONG':
        pongsReceived++;
        if (pendingPing) {
          const latency = now - pendingPing;
          pingLatencies.push(latency);

          // Log high latency
          if (latency > 200) {
            logWarning(`High ping latency: ${latency}ms`);
          }

          // Periodic ping stats every 10 pongs (~20 seconds)
          if (pongsReceived % 10 === 0) {
            const recent = pingLatencies.slice(-10);
            const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
            const max = Math.max(...recent);
            log(`Ping stats - Avg: ${avg.toFixed(0)}ms | Max: ${max}ms`);
          }

          pendingPing = null;
        }
        break;

      case 'COMBAT_EVENT':
        // Track combat events (these can be bursty)
        break;

      case 'FLOOR_COMPLETE':
        log(`Floor complete! Advancing...`);
        break;
    }
  } catch (e) {
    logError(`Failed to parse message: ${e.message}`);
  }
});

ws.on('close', (code, reason) => {
  logError(`Connection closed - code: ${code}, reason: ${reason || 'none'}`);
  printSummary();
  process.exit(0);
});

ws.on('error', (error) => {
  logError(`WebSocket error: ${error.message}`);
});

// Print summary on exit
function printSummary() {
  const elapsed = (Date.now() - startTime) / 1000;

  console.log('\n');
  console.log('='.repeat(60));
  console.log('LAG DIAGNOSTIC SUMMARY');
  console.log('='.repeat(60));
  console.log(`Duration: ${elapsed.toFixed(1)} seconds`);
  console.log(`Total messages: ${messageCount}`);
  console.log(`State updates: ${stateUpdateCount}`);
  console.log(`Updates/sec: ${(stateUpdateCount / elapsed).toFixed(1)} (expected: 20)`);

  if (stateUpdateGaps.length > 0) {
    const avgGap = stateUpdateGaps.reduce((a, b) => a + b, 0) / stateUpdateGaps.length;
    const maxGap = Math.max(...stateUpdateGaps);
    const lagSpikes = stateUpdateGaps.filter(g => g > LAG_THRESHOLD).length;
    const lagPercent = (lagSpikes / stateUpdateGaps.length * 100).toFixed(1);

    console.log(`\nState Update Gaps:`);
    console.log(`  Average: ${avgGap.toFixed(1)}ms (expected: ~50ms)`);
    console.log(`  Maximum: ${maxGap}ms`);
    console.log(`  Lag spikes (>${LAG_THRESHOLD}ms): ${lagSpikes} (${lagPercent}%)`);
  }

  if (pingLatencies.length > 0) {
    const avgPing = pingLatencies.reduce((a, b) => a + b, 0) / pingLatencies.length;
    const maxPing = Math.max(...pingLatencies);
    const minPing = Math.min(...pingLatencies);

    console.log(`\nPing Latency:`);
    console.log(`  Average: ${avgPing.toFixed(0)}ms`);
    console.log(`  Range: ${minPing}-${maxPing}ms`);
  }

  if (messageSizes.length > 0) {
    const avgSize = messageSizes.reduce((a, b) => a + b, 0) / messageSizes.length;
    const maxSize = Math.max(...messageSizes);

    console.log(`\nMessage Sizes:`);
    console.log(`  Average: ${(avgSize / 1024).toFixed(2)} KB`);
    console.log(`  Maximum: ${(maxSize / 1024).toFixed(2)} KB`);
  }

  if (largeMessages.length > 0) {
    console.log(`\nLarge Messages (>10KB): ${largeMessages.length}`);
    largeMessages.slice(0, 5).forEach(m => {
      console.log(`  - ${(m.size / 1024).toFixed(1)}KB at ${(m.elapsed / 1000).toFixed(1)}s`);
    });
  }

  console.log('='.repeat(60));
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  log('Stopping diagnostic...');
  ws.close();
});

// Send movement to keep the game active
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN && runId) {
    // Send random movement to simulate playing
    const moveX = (Math.random() - 0.5) * 2;
    const moveY = (Math.random() - 0.5) * 2;
    ws.send(JSON.stringify({
      type: 'PLAYER_INPUT',
      input: { moveX, moveY }
    }));
  }
}, 100); // Send input at 10Hz like a real player

log('Press Ctrl+C to stop and see summary');
