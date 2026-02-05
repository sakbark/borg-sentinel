const axios = require('axios');
const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false });

async function checkProxmox() {
  const host = process.env.PROXMOX_HOST || '192.168.50.122';
  const tokenId = process.env.PROXMOX_TOKEN_ID;
  const tokenSecret = process.env.PROXMOX_TOKEN_SECRET;

  // If no API token, just check if the web UI is responsive (401 = server is up)
  if (!tokenId || !tokenSecret) {
    const start = Date.now();
    try {
      await axios.get(`https://${host}:8006/api2/json`, { httpsAgent: agent, timeout: 5000 });
    } catch (err) {
      if (err.response && err.response.status === 401) {
        return { status: 'up', response_ms: Date.now() - start, details: { note: 'no API token - 401 means server responding' } };
      }
      throw err;
    }
    return { status: 'up', response_ms: Date.now() - start, details: { note: 'no API token - UI check only' } };
  }

  const start = Date.now();
  const headers = { Authorization: `PVEAPIToken=${tokenId}=${tokenSecret}` };
  const base = `https://${host}:8006/api2/json`;

  const [nodeRes, vmRes] = await Promise.all([
    axios.get(`${base}/nodes`, { headers, httpsAgent: agent, timeout: 8000 }),
    axios.get(`${base}/nodes/${process.env.PROXMOX_NODE || 'pve'}/qemu`, { headers, httpsAgent: agent, timeout: 8000 }).catch(() => null)
  ]);

  const node = nodeRes.data?.data?.[0] || {};
  const cpuPct = Math.round((node.cpu || 0) * 100);
  const ramPct = Math.round(((node.mem || 0) / (node.maxmem || 1)) * 100);

  const details = { cpu: cpuPct, ram_pct: ramPct };
  if (vmRes?.data?.data) {
    details.vms = vmRes.data.data.map(v => ({ name: v.name, status: v.status }));
  }

  return { status: 'up', response_ms: Date.now() - start, details };
}

async function checkHomeAssistant() {
  const host = process.env.HA_HOST || '192.168.50.50';
  const token = process.env.HA_TOKEN;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const start = Date.now();
  const res = await axios.get(`http://${host}:8123/api/`, { headers, timeout: 5000 });
  return { status: 'up', response_ms: Date.now() - start, ha_message: res.data?.message };
}

async function checkPlex() {
  const host = process.env.PLEX_HOST || '192.168.50.50';
  const port = process.env.PLEX_PORT || '32400';

  const start = Date.now();
  const res = await axios.get(`http://${host}:${port}/identity`, { timeout: 5000 });
  return { status: 'up', response_ms: Date.now() - start };
}

async function checkDSM() {
  const host = process.env.DSM_HOST || '192.168.50.100';
  const port = process.env.DSM_PORT || '5000';

  const start = Date.now();
  await axios.get(`http://${host}:${port}`, { timeout: 5000, maxRedirects: 3 });
  return { status: 'up', response_ms: Date.now() - start };
}

async function checkInternet() {
  const start = Date.now();
  const dns = require('dns').promises;
  await dns.resolve('google.com');
  await axios.get('https://www.google.com/generate_204', { timeout: 5000 });
  return { status: 'up', response_ms: Date.now() - start };
}

module.exports = { checkProxmox, checkHomeAssistant, checkPlex, checkDSM, checkInternet };
