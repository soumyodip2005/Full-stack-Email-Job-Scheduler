# Email Job Scheduler

Schedule emails through an API or dashboard and have them sent at the right time, at scale, even across server restarts. Built with **BullMQ delayed jobs (no cron)**, Redis, Postgres, Elasticsearch and React.

**Stack:** TypeScript, Express, BullMQ + Redis, Postgres, Nodemailer (Ethereal SMTP), Elasticsearch, React + Vite + Tailwind, Google OAuth, Slack OAuth.

## Run locally

Requires Node 18+ and Docker.

```bash
docker compose up -d                 # Postgres, Redis, Elasticsearch

cd backend
cp .env.example .env                 # add Google keys + JWT_SECRET (Slack optional)
npm install && npm run dev           # API + worker -> http://localhost:4000

cd ../frontend
cp .env.example .env
npm install && npm run dev           # UI -> http://localhost:5173
```

- **Google login:** create a Web OAuth client, set redirect URI `http://localhost:4000/auth/google/callback`.
- **Slack (optional):** create a Slack app, add scope `incoming-webhook`, redirect URI `http://localhost:4000/api/slack/callback` (use ngrok if Slack requires HTTPS).
- **Ethereal:** automatic. Sender accounts are created on first boot. Open a sent email's **Preview** link to view it.
- **Queue dashboard:** `http://localhost:4000/admin/queues` (login from `BULL_BOARD_USER` / `BULL_BOARD_PASS`).

## How it works

```
Dashboard -> POST /api/emails/schedule
   1. save rows in Postgres (source of truth)
   2. add BullMQ delayed jobs (jobId = row id)
   3. index in Elasticsearch
Worker, when a job is due:
   claim row atomically -> check hourly limit (Redis) -> send via SMTP -> mark sent/failed
```

**Scheduling.** Each recipient is one DB row plus one BullMQ delayed job, spaced by the chosen delay and spread round-robin across senders. No cron or timers.

**Persistence and no duplicates.**
- Jobs live in Redis (AOF on); the Postgres row is the source of truth.
- On every startup, unsent rows are re-offered to the queue. Since `jobId = row id`, existing jobs are ignored and lost ones are recreated.
- Before sending, a worker atomically flips `scheduled -> sending` in Postgres. Only one worker can win, so an email is never sent twice.

**Concurrency.** `WORKER_CONCURRENCY` jobs run in parallel. All shared state (row claim, rate counter) is atomic, so this is safe.

**Delay between emails.** BullMQ limiter, 1 send per `MIN_DELAY_BETWEEN_EMAILS_MS` (default **2 seconds**), enforced globally through Redis.

**Hourly rate limit.** A Redis Lua script counts sends per `sender + hour window`, atomically across all workers. Effective limit is `min(requested, MAX_EMAILS_PER_HOUR_PER_SENDER)`. When the limit is hit, jobs are **not dropped**: they are moved to the next hour window (in original order) and a Slack message is sent once per sender per window. If Slack is not connected, the alert is skipped silently.

**1000+ emails at once.** All are stored and queued in bulk, then drained at the global delay and per-sender hourly caps. The overflow rolls into the following hours automatically.

**Search.** Emails are indexed in Elasticsearch: `GET /api/emails/search?q=...`.

## Features

- **Backend:** schedule API, delayed jobs, multiple senders, restart-safe, idempotent, configurable concurrency, delay and hourly limit, Slack alerts, Elasticsearch search, Bull Board.
- **Frontend:** Google login, header with name/email/avatar and logout, Scheduled and Sent tabs, compose modal (CSV upload with detected count, start time, delay, hourly limit), loading/empty/error states, auto-refresh.

## Key settings (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `WORKER_CONCURRENCY` | 5 | Parallel jobs per worker |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | 2000 | Minimum gap between sends |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | 200 | Hourly ceiling per sender |
| `SENDER_COUNT` | 3 | Ethereal senders created |

## Demo checklist

1. Log in, then schedule emails from a CSV.
2. Show Scheduled turning into Sent, and the Bull Board.
3. Restart test: schedule ahead, stop the server, start it again, and show the emails still send once.
4. Rate limit: set the hourly limit to 3, schedule 8, and show the rest deferred plus the Slack message.

## Trade-offs

- A crash between "SMTP accepted" and "marked sent" can cause one repeat (at-least-once). The Message-ID makes it detectable.
- The hourly limit uses fixed windows, so a burst is possible at a window edge.
- Elasticsearch is best-effort: if it is down, sending continues and indexing is skipped.
- UI follows the functional spec; adjust styling to match the Figma.
