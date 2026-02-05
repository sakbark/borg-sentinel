require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const { checkProxmox, checkHomeAssistant, checkPlex, checkDSM, checkInternet } = require('./checks/local');
const { checkQueen, checkHiveMonitor, checkWorkers, checkMongoDB } = require('./checks/hive');
const { checkWhatsApp, checkCalendarGPT } = require('./checks/external');
const { processResults, getActiveAlertCount, sendPushover } = require('./alerts');

const app = express();
const PORT = process.env.PORT || 3333;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL_MS) || 300000;

let mongoClient = null;
let db = null;
let latestResult = null;

async function getDb() {
  if (db) return db;
  mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();
  db = mongoClient.db(process.env.MONGODB_DB || 'scheduler_memory');
  return db;
}

async function runCheck(name, fn) {
  try {
    return await fn();
  } catch (err) {
    return { status: 'down', error: err.message };
  }
}

async function runAllChecks() {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] Running all checks...`);

  let database;
  try {
    database = await getDb();
  } catch (err) {
    console.error(`[MONGO] Connection failed: ${err.message}`);
    database = null;
  }

  // Run all checks in parallel
  const [proxmox, homeassistant, plex, dsm, internet, queen, hive_monitor, workers, mongodb, whatsapp, calendar_gpt] =
    await Promise.all([
      runCheck('proxmox', checkProxmox),
      runCheck('homeassistant', checkHomeAssistant),
      runCheck('plex', checkPlex),
      runCheck('dsm', checkDSM),
      runCheck('internet', checkInternet),
      runCheck('queen', () => database ? checkQueen(database) : { status: 'down', error: 'no db' }),
      runCheck('hive_monitor', () => database ? checkHiveMonitor(database) : { status: 'down', error: 'no db' }),
      runCheck('workers', () => database ? checkWorkers(database) : { status: 'down', error: 'no db' }),
      runCheck('mongodb', () => database ? checkMongoDB(database) : { status: 'down', error: 'connection failed' }),
      runCheck('whatsapp', checkWhatsApp),
      runCheck('calendar_gpt', checkCalendarGPT),
    ]);

  const services = { proxmox, homeassistant, plex, dsm, internet, queen, hive_monitor, workers, whatsapp, mongodb, calendar_gpt };

  // Process alerts (debounce + state change detection)
  const alerts = await processResults(services);

  const allUp = Object.values(services).every(s => s.status === 'up');
  const anyDown = Object.values(services).some(s => s.status === 'down');

  latestResult = {
    overall: allUp ? 'healthy' : anyDown ? 'degraded' : 'partial',
    last_check: new Date().toISOString(),
    check_duration_ms: Date.now() - start,
    services,
    alerts_active: getActiveAlertCount()
  };

  // Save to MongoDB
  if (database) {
    try {
      await database.collection('system').updateOne(
        { _id: 'borg_sentinel_latest' },
        { $set: { ...latestResult, updated_at: new Date() } },
        { upsert: true }
      );
    } catch (err) {
      console.error(`[MONGO] Failed to save results: ${err.message}`);
    }
  }

  const upCount = Object.values(services).filter(s => s.status === 'up').length;
  console.log(`[${new Date().toISOString()}] Checks done: ${upCount}/${Object.keys(services).length} up (${Date.now() - start}ms)`);

  return latestResult;
}

// --- API Routes ---

app.get('/api/status', (req, res) => {
  if (!latestResult) return res.status(503).json({ error: 'no checks run yet' });
  res.json(latestResult);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api/check', async (req, res) => {
  try {
    const result = await runAllChecks();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Startup ---

async function start() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🛡️  Borg Sentinel listening on port ${PORT}`);
  });

  // Run first check immediately
  await runAllChecks();

  // Then every CHECK_INTERVAL
  setInterval(runAllChecks, CHECK_INTERVAL);

  console.log(`⏰ Check interval: ${CHECK_INTERVAL / 1000}s`);
  await sendPushover('🛡️ Borg Sentinel Online', `Monitoring ${11} services every ${CHECK_INTERVAL / 60000} min`);
}

start().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
