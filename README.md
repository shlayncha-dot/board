# Naming Proxy Service

Node.js proxy service for forwarding naming verification requests from .NET to 1C HS using OpenSSL TLS stack.

## Features

- `POST /api/verification/naming`
- Accepts payloads:
  - `[{ "name": "..." }]`
  - `{ "items": [{ "name": "..." }] }`
  - `{ "items": [{ "Name": "..." }] }`
- Normalizes and forwards upstream payload as JSON array of `{ "name": "..." }` objects.
- Requires `X-API-Key` header (`PROXY_API_KEY` from environment).
- Authorization forwarding:
  - If `Authorization` header exists, forwards it 1:1.
  - If absent, uses `NAMING_USER`/`NAMING_PASS` for Basic Auth.
- TLS behavior:
  - Default: certificate verification enabled.
  - `TLS_INSECURE=true`: disables cert verification.
- Upstream timeout configurable with `UPSTREAM_TIMEOUT_MS` (default `30000`).
- Request body limit: `5MB`.
- Logs `requestId`, `itemCount`, `upstreamStatus`, `durationMs`.

## Environment variables

| Variable | Required | Default |
| --- | --- | --- |
| `UPSTREAM_URL` | no | `https://erp-ge.omnic.solutions/stainless-dev/hs/sls/nomenclature/check` |
| `LISTEN_HOST` | no | `0.0.0.0` |
| `LISTEN_PORT` | no | `8088` |
| `PROXY_API_KEY` | **yes** | - |
| `NAMING_USER` | no | - |
| `NAMING_PASS` | no | - |
| `TLS_INSECURE` | no | `false` |
| `UPSTREAM_TIMEOUT_MS` | no | `30000` |

## Run with Docker Compose

```bash
docker compose up -d
```

```bash
docker compose logs -f
```

## Manual run (local)

```bash
npm install
npm start
```

## Request examples

Without Basic Auth header:

```bash
curl -X POST http://<MY_SERVER>:8088/api/verification/naming \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <key>" \
  -d '[{"name":"ABC"}]'
```

With Basic Auth header:

```bash
curl -X POST http://<MY_SERVER>:8088/api/verification/naming \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <key>" \
  -H "Authorization: Basic <base64>" \
  -d '{"items":[{"Name":"ABC"}]}'
```

## .NET integration note

Update `CheckUrl` to:

`http://<MY_SERVER>:8088/api/verification/naming`

Add `X-API-Key` header from configuration. Keep current `Authorization: Basic ...` behavior unchanged.
