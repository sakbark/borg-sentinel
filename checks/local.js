const axios = require('axios');
const https = require('https');
const net = require('net');

const agent = new https.Agent({ rejectUnauthorized: false });
const LOCAL_TIMEOUT = 15000; // Higher timeout for LAN - NFS stalls can slow kernel I/O

function tcpPing(host, port, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const sock = new net.Socket();
    sock.setTimeout(timeout);
    sock.on('connect', () => { sock.destroy(); resolve(Date.now() - start); });
    sock.on('timeout', () => { sock.destroy(); reject(new Error('TCP timeout')); });
    sock.on('error', (e) => { sock.destroy(); reject(e); });
    sock.connect(port, host);
  });
}

async function checkProxmox() {
  const host = process.env.PROXMOX_HOST || '192.168.50.122';
  const tailscaleHost = process.env.PROXMOX_TAILSCALE_HOST || '100.74.69.38';
  const tokenId = process.env.PROXMOX_TOKEN_ID;
  const tokenSecret = process.env.PROXMOX_TOKEN_SECRET;
  const fs = require('fs');

  // Always get LXC uptime as baseline
  const uptime = fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0];
  const uptimeSec = Math.round(parseFloat(uptime));

  // If no API token, just report LXC uptime (proves Proxmox is running)
  if (!tokenId || !tokenSecret) {
    return { status: 'up', response_ms: 0, details: { note: 'Running inside Proxmox LXC', lxc_uptime_sec: uptimeSec } };
  }

  // Try API via Tailscale IP (LXC can't reach host via bridge)
  const start = Date.now();
  const headers = { Authorization: `PVEAPIToken=${tokenId}=${tokenSecret}` };

  try {
    const base = `https://${tailscaleHost}:8006/api2/json`;
    const [nodeRes, vmRes] = await Promise.all([
      axios.get(`${base}/nodes`, { headers, httpsAgent: agent, timeout: 8000 }),
      axios.get(`${base}/nodes/${process.env.PROXMOX_NODE || 'pve'}/qemu`, { headers, httpsAgent: agent, timeout: 8000 }).catch(() => null)
    ]);

    const node = nodeRes.data?.data?.[0] || {};
    const cpuPct = Math.round((node.cpu || 0) * 100);
    const ramPct = Math.round(((node.mem || 0) / (node.maxmem || 1)) * 100);

    const details = { cpu: cpuPct, ram_pct: ramPct, lxc_uptime_sec: uptimeSec };
    if (vmRes?.data?.data) {
      details.vms = vmRes.data.data.map(v => ({ name: v.name, status: v.status }));
    }
    return { status: 'up', response_ms: Date.now() - start, details };
  } catch (err) {
    // API failed but LXC is running = Proxmox is up
    return { status: 'up', response_ms: 0, details: { note: 'API unreachable, but LXC running', lxc_uptime_sec: uptimeSec, api_error: err.message } };
  }
}

async function checkHomeAssistant() {
  const host = process.env.HA_HOST || '192.168.50.50';
  const token = process.env.HA_TOKEN;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const start = Date.now();
  const res = await axios.get(`http://${host}:8123/api/`, { headers, timeout: LOCAL_TIMEOUT });
  return { status: 'up', response_ms: Date.now() - start, ha_message: res.data?.message };
}

async function checkPlex() {
  const host = process.env.PLEX_HOST || '192.168.50.50';
  const port = process.env.PLEX_PORT || '32400';

  const start = Date.now();
  await axios.get(`http://${host}:${port}/identity`, { timeout: LOCAL_TIMEOUT });
  return { status: 'up', response_ms: Date.now() - start };
}

async function checkDSM() {
  const host = process.env.DSM_HOST || '192.168.50.100';
  const port = process.env.DSM_PORT || '5000';

  const start = Date.now();
  await axios.get(`http://${host}:${port}`, { timeout: LOCAL_TIMEOUT, maxRedirects: 3 });
  return { status: 'up', response_ms: Date.now() - start };
}

async function checkInternet() {
  const start = Date.now();
  await axios.get('https://1.1.1.1/cdn-cgi/trace', { timeout: 10000 });
  return { status: 'up', response_ms: Date.now() - start };
}

module.exports = { checkProxmox, checkHomeAssistant, checkPlex, checkDSM, checkInternet };
