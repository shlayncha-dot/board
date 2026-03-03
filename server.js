const crypto = require('crypto');
const express = require('express');
const { Agent } = require('undici');

const UPSTREAM_URL = process.env.UPSTREAM_URL || 'https://erp-ge.omnic.solutions/stainless-dev/hs/sls/nomenclature/check';
const LISTEN_HOST = process.env.LISTEN_HOST || '0.0.0.0';
const LISTEN_PORT = Number(process.env.LISTEN_PORT || 8088);
const PROXY_API_KEY = process.env.PROXY_API_KEY;
const NAMING_USER = process.env.NAMING_USER;
const NAMING_PASS = process.env.NAMING_PASS;
const TLS_INSECURE = String(process.env.TLS_INSECURE || 'false').toLowerCase() === 'true';
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 30000);

if (!PROXY_API_KEY) {
  console.error('Environment variable PROXY_API_KEY is required.');
  process.exit(1);
}

const insecureAgent = TLS_INSECURE
  ? new Agent({
      connect: {
        rejectUnauthorized: false,
      },
    })
  : undefined;

const app = express();
app.use(express.json({ limit: '5mb' }));

function resolveAuthorizationHeader(req) {
  if (req.headers.authorization) {
    return req.headers.authorization;
  }

  if (NAMING_USER && NAMING_PASS) {
    const encoded = Buffer.from(`${NAMING_USER}:${NAMING_PASS}`, 'utf8').toString('base64');
    return `Basic ${encoded}`;
  }

  return undefined;
}

function normalizeItems(payload) {
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray(payload.items)
      ? payload.items
      : null;

  if (!source) {
    throw new Error('Body must be an array or object with items array.');
  }

  return source.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Item at index ${index} must be an object.`);
    }

    const value = typeof item.name === 'string'
      ? item.name
      : typeof item.Name === 'string'
        ? item.Name
        : undefined;

    if (value === undefined) {
      throw new Error(`Item at index ${index} must contain "name" or "Name" as string.`);
    }

    return { name: value };
  });
}

function sendUpstreamResponse(res, upstreamRes, rawBody) {
  res.status(upstreamRes.status);

  upstreamRes.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'content-length') {
      return;
    }

    res.setHeader(key, value);
  });

  res.send(Buffer.from(rawBody));
}

app.post('/api/verification/naming', async (req, res) => {
  const startedAt = Date.now();
  const requestId = (req.headers['x-request-id'] || crypto.randomUUID()).toString();

  if (req.headers['x-api-key'] !== PROXY_API_KEY) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  let normalizedItems;

  try {
    normalizedItems = normalizeItems(req.body);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  const authorization = resolveAuthorizationHeader(req);
  const headers = {
    'content-type': 'application/json',
    'x-request-id': requestId,
  };

  if (authorization) {
    headers.authorization = authorization;
  }

  let timeoutId;
  const controller = new AbortController();
  timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamRes = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(normalizedItems),
      signal: controller.signal,
      dispatcher: insecureAgent,
    });

    const rawBody = await upstreamRes.arrayBuffer();
    const duration = Date.now() - startedAt;

    console.log(
      JSON.stringify({
        requestId,
        itemCount: normalizedItems.length,
        upstreamStatus: upstreamRes.status,
        durationMs: duration,
      }),
    );

    sendUpstreamResponse(res, upstreamRes, rawBody);
  } catch (error) {
    const duration = Date.now() - startedAt;

    if (error.name === 'AbortError') {
      console.warn(
        JSON.stringify({
          requestId,
          itemCount: normalizedItems.length,
          upstreamStatus: 504,
          durationMs: duration,
          error: 'Upstream timeout',
        }),
      );

      return res.status(504).json({ message: 'Upstream timeout' });
    }

    console.error(
      JSON.stringify({
        requestId,
        itemCount: normalizedItems.length,
        upstreamStatus: 502,
        durationMs: duration,
        error: error.message,
      }),
    );

    return res.status(502).json({ message: 'Bad gateway' });
  } finally {
    clearTimeout(timeoutId);
  }
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body too large. Max size is 5MB.' });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ message: 'Invalid JSON payload.' });
  }

  return next(err);
});

app.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`Naming proxy listening on http://${LISTEN_HOST}:${LISTEN_PORT}`);
});
