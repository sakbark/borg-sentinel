const axios = require('axios');

async function checkWhatsApp() {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) return { status: 'down', reason: 'no Evolution API config' };

  const headers = { apikey: apiKey };
  const instances = ['personal-whatsapp', 'business-whatsapp'];

  const results = {};
  let allConnected = true;

  for (const instance of instances) {
    try {
      const res = await axios.get(`${baseUrl}/instance/connectionState/${instance}`, {
        headers, timeout: 8000
      });
      const state = res.data?.instance?.state || res.data?.state || 'unknown';
      results[instance] = state;
      if (state !== 'open') allConnected = false;
    } catch (err) {
      results[instance] = 'error';
      allConnected = false;
    }
  }

  return { status: allConnected ? 'up' : 'degraded', instances: results };
}

async function checkCalendarGPT() {
  const baseUrl = process.env.CALENDAR_GPT_URL;
  const apiKey = process.env.CALENDAR_GPT_API_KEY;
  if (!baseUrl) return { status: 'down', reason: 'no Calendar GPT URL' };

  const start = Date.now();
  const headers = apiKey ? { 'X-API-Key': apiKey } : {};

  // Try /health first, fall back to /pushover/send with dry-run-style GET
  try {
    const res = await axios.get(`${baseUrl}/health`, { headers, timeout: 8000 });
    return { status: 'up', response_ms: Date.now() - start };
  } catch (err) {
    // /health might not exist on current deploy - try /docs or root
    try {
      const res2 = await axios.get(`${baseUrl}/openapi.json`, { headers, timeout: 8000 });
      return { status: 'up', response_ms: Date.now() - start, note: 'health endpoint missing, used openapi fallback' };
    } catch (err2) {
      throw err; // throw original error
    }
  }
}

module.exports = { checkWhatsApp, checkCalendarGPT };
