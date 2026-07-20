# CortexAI

A multi-agent AI platform built as microservices. A supervisor graph routes each
request to a specialist agent — chat, web search, code generation, PDF and
slide generation, vision, and retrieval over uploaded documents — with credits
metered per run and billing behind Razorpay.

> **Live demo:** _add your URL here after deploying_

---

## Architecture

```
   Browser
      │
      ▼
 ┌──────────┐   Vercel (static)
 │  React   │
 └────┬─────┘
      │ HTTPS, Bearer access token
      ▼
 ┌──────────────────────────────────────────┐
 │  Gateway  :8000                          │  the only public entry
 │  verifies JWT · rate limits · routes     │
 └───┬────────┬─────────┬─────────┬─────────┘
     │        │         │         │
     ▼        ▼         ▼         ▼
  ┌──────┐ ┌──────┐ ┌───────┐ ┌─────────┐
  │ Auth │ │ Chat │ │ Agent │ │ Billing │
  │ 8001 │ │ 8002 │ │ 8003  │ │  8004   │
  └───┬──┘ └───┬──┘ └───┬───┘ └────┬────┘
      │        │        │          │
      ▼        ▼        ▼          ▼
   MongoDB · Redis · Qdrant · S3 · Gemini/Groq
```

Services never call each other's databases. Every internal call is signed with a
shared secret, so a service reachable at its own public URL still refuses
anything that did not come through the gateway.

| Service | Port | Responsibility |
|---|---|---|
| `gateway` | 8000 | Single public entry. Verifies access tokens, rate limits, routes, injects request ids. |
| `auth` | 8001 | Registration, login, token rotation, profile, credit ledger. |
| `chat` | 8002 | Conversations and messages, with ownership checks. |
| `agent` | 8003 | LangGraph supervisor and all specialist agents. |
| `billing` | 8004 | Plans, Razorpay orders, payment verification. |

### Design decisions worth knowing

**Two-token auth with reuse detection.** A 15-minute JWT access token is verified
locally by the gateway, so authenticating a request costs no database lookup. The
refresh token is opaque, stored hashed in Redis, and rotated on every use.
Retired tokens are kept and marked used — presenting one again means two copies
exist, so the whole token family is revoked and both parties must sign in again.

**Credits are an append-only ledger.** `user.credits` is a cached balance for the
hot path; every movement is also written as a ledger entry that is never edited.
The entries sum to the balance, and a reconciliation check proves it. A failed
run refunds by run id, reversing *every* charge that run made — a search request
pays for the search agent and then the chat agent, so refunding only the last
would leave the user short.

**Idempotency everywhere money moves.** Charges, refunds and payment
verification are keyed so retries, duplicate webhooks and replayed Razorpay
responses apply exactly once.

---

## Tech stack

Node 24 · Express 5 · MongoDB (Mongoose) · Redis · Qdrant · LangGraph ·
Gemini / Groq · React 19 · Vite · Redux Toolkit · Tailwind · Docker · Vitest

---

## Running locally

**Requirements:** Node 24+, Docker.

```bash
git clone <your-repo-url>
cd cortex-ai/backend

# MongoDB and Redis, with healthchecks
docker-compose up -d          # or: docker compose up -d

# Every service reads its own .env
for d in gateway services/auth services/chat services/agent services/billing; do
  cp $d/.env.example $d/.env
done
```

Now generate two secrets and put the **same value** in every `.env` that asks
for them:

```bash
openssl rand -hex 32   # -> INTERNAL_API_KEY  (all five services)
openssl rand -hex 32   # -> JWT_ACCESS_SECRET (gateway and auth only)
```

Set `MONGODB_URL=mongodb://localhost:27017/cortex-ai` in auth, chat, agent and
billing. Then start each service in its own terminal:

```bash
npm run dev:gateway
npm run dev:auth
npm run dev:chat
npm run dev:agent
npm run dev:billing
```

And the frontend:

```bash
cd ../frontend
cp .env.example .env      # VITE_SERVER_URL should be http://localhost:8000
npm install
npm run dev
```

Open http://localhost:5173 and register an account. **You can sign up and chat
with no API keys at all** — the app runs, but any agent that needs a provider
will tell you which key is missing rather than failing obscurely.

### Which keys unlock what

| Key | Needed for | Free? |
|---|---|---|
| `GOOGLE_API_KEY` | Chat agent, embeddings | Yes — [aistudio.google.com](https://aistudio.google.com/apikey) |
| `GROQ_API_KEY` | Fast model fallback | Yes — [console.groq.com](https://console.groq.com/keys) |
| `TAVILY_API_KEY` | Search agent | Yes, 1000/month |
| `QDRANT_URL` / `QDRANT_API_KEY` | PDF RAG agent | Yes, 1GB — [cloud.qdrant.io](https://cloud.qdrant.io) |
| `AWS_*` | PDF, PPT, image artifacts | 5GB free for 12 months |
| `RAZORPAY_*` | Billing | Test mode is free |
| `VITE_FIREBASE_API_KEY` | Google sign-in (optional) | Yes |

---

## Tests

```bash
cd backend
npm test
```

66 tests covering credit accounting, session handling and reuse detection,
conversation access control, payment replay, and one real run of the agent graph
with the model mocked.

Tests use their own database (`cortex-ai-test`) and Redis index, and refuse to
run unless the database name contains `test`, because the suite wipes data
between cases.

---

## Deployment

Backend on **Render**, frontend on **Vercel**, databases on free managed tiers.
Everything below stays within free plans.

### 1. Managed data stores

| What | Where | Plan |
|---|---|---|
| MongoDB | [MongoDB Atlas](https://cloud.mongodb.com) | M0, free forever |
| Redis | [Upstash](https://upstash.com) | Free, no card |
| Qdrant | [Qdrant Cloud](https://cloud.qdrant.io) | 1GB, free |

On Atlas, allow access from anywhere (`0.0.0.0/0`) — Render does not publish
fixed egress IPs on the free plan.

### 2. Backend

Push to GitHub, then in Render choose **New → Blueprint** and point it at
`backend/render.yaml`. It creates all five services.

Then fill in the environment variables Render marks as required:

- `INTERNAL_API_KEY` — the same value in **all five** services
- `JWT_ACCESS_SECRET` — the same value in gateway **and** auth
- `MONGODB_URL`, `REDIS_URL` — from Atlas and Upstash
- On the gateway, set `AUTH_SERVICE`, `CHAT_SERVICE`, `AGENT_SERVICE` and
  `BILLING_SERVICE` to the other services' Render URLs (available after their
  first deploy), and `CORS_ORIGINS` to your Vercel URL
- Provider keys on the agent service, Razorpay keys on billing

### 3. Frontend

Import the repo in Vercel, set the root directory to `frontend`, and set
`VITE_SERVER_URL` to your gateway's Render URL. `vercel.json` already handles
SPA routing and asset caching.

Finally set `CORS_ORIGINS` on the gateway to the Vercel URL and redeploy it.

### Free-tier reality

Free Render services sleep after 15 minutes idle and take roughly 50 seconds to
wake. Because the gateway calls other services, a first visit after a nap can
wake several in sequence.

The free plan also grants a fixed pool of instance-hours shared across all free
services, so keeping five awake around the clock is not possible — sleeping is
what keeps this inside the allowance. Practical options:

- **Accept it** and tell visitors the first load is slow. Costs nothing.
- **Keep only the gateway and auth warm** with a free uptime pinger, so signing
  in is fast and only the agent wakes on demand.
- **Run it on one always-free VM** (Oracle Cloud gives 4 ARM cores free
  permanently) with `docker-compose`, which removes cold starts entirely.

---

## Repository layout

```
backend/
├── gateway/            public entry point
├── services/
│   ├── auth/           accounts, tokens, credit ledger
│   ├── chat/           conversations and messages
│   ├── agent/          LangGraph supervisor + agents
│   └── billing/        plans and payments
├── shared/             errors, logging, validation, config
├── tests/              vitest suites
├── docker-compose.yml  mongo + redis for local work
└── render.yaml         one-click backend deploy

frontend/               React + Vite SPA
```
