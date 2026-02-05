const axios = require('axios');

// Track state for debounce: { serviceName: { failCount: 0, lastStatus: 'up', alerted: false } }
const state = {};

function getState(name) {
  if (!state[name]) state[name] = { failCount: 0, lastStatus: 'up', alerted: false };
  return state[name];
}

async function sendPushover(title, message, priority = 0) {
  const url = process.env.CALENDAR_GPT_URL;
  const apiKey = process.env.CALENDAR_GPT_API_KEY;
  if (!url || !apiKey) {
    console.log(`[ALERT] (no pushover config) ${title}: ${message}`);
    return;
  }

  try {
    await axios.post(`${url}/pushover/send`, {
      title,
      message,
      priority
    }, {
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      timeout: 10000
    });
    console.log(`[PUSHOVER] Sent: ${title}`);
  } catch (err) {
    console.error(`[PUSHOVER] Failed: ${err.message}`);
  }
}

async function processResults(services) {
  const alerts = [];

  for (const [name, result] of Object.entries(services)) {
    const s = getState(name);
    const isUp = result.status === 'up';

    if (!isUp) {
      s.failCount++;

      // Debounce: alert after 2 consecutive failures (10 min at 5-min intervals)
      if (s.failCount >= 2 && !s.alerted) {
        s.alerted = true;
        s.lastStatus = 'down';
        const detail = result.reason || result.error || JSON.stringify(result.details || {});
        const msg = `🔴 ${name} is DOWN\n${detail}`.trim();
        alerts.push({ type: 'down', service: name, message: msg });
        await sendPushover(`🔴 ${name} DOWN`, msg, 1);
      }
    } else {
      // Recovery: was down (alerted), now back up
      if (s.alerted && s.lastStatus === 'down') {
        const msg = `🟢 ${name} is back UP`;
        alerts.push({ type: 'recovery', service: name, message: msg });
        await sendPushover(`🟢 ${name} RECOVERED`, msg, 0);
      }
      s.failCount = 0;
      s.alerted = false;
      s.lastStatus = 'up';
    }
  }

  return alerts;
}

function getAlertStates() {
  return { ...state };
}

function getActiveAlertCount() {
  return Object.values(state).filter(s => s.alerted).length;
}

module.exports = { processResults, getAlertStates, getActiveAlertCount, sendPushover };
