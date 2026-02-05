async function checkQueen(db) {
  const doc = await db.collection('ai_coordination').findOne({ _id: 'queen_jarvis_active' });
  if (!doc) return { status: 'down', reason: 'no queen doc found' };

  const heartbeatAge = (Date.now() - new Date(doc.last_heartbeat || doc.timestamp).getTime()) / 60000;
  const fresh = heartbeatAge < 10;
  return {
    status: fresh ? 'up' : 'down',
    heartbeat_age_min: Math.round(heartbeatAge),
    queen_status: doc.status
  };
}

async function checkHiveMonitor(db) {
  const doc = await db.collection('ai_coordination').findOne({ _id: 'hive_monitor_active' });
  if (!doc) return { status: 'down', reason: 'no hive monitor doc found' };

  const heartbeatAge = (Date.now() - new Date(doc.last_heartbeat || doc.timestamp).getTime()) / 60000;
  const fresh = heartbeatAge < 10;
  return {
    status: fresh ? 'up' : 'down',
    heartbeat_age_min: Math.round(heartbeatAge)
  };
}

async function checkWorkers(db) {
  const workers = await db.collection('ai_coordination').find({
    type: 'borg_worker_active',
    status: 'active',
    last_heartbeat: { $gte: new Date(Date.now() - 10 * 60 * 1000) }
  }).toArray();

  return {
    status: workers.length > 0 ? 'up' : 'down',
    count: workers.length,
    workers: workers.map(w => ({ id: w._id, task: w.task }))
  };
}

async function checkMongoDB(db) {
  const start = Date.now();
  await db.command({ ping: 1 });
  return { status: 'up', response_ms: Date.now() - start };
}

module.exports = { checkQueen, checkHiveMonitor, checkWorkers, checkMongoDB };
