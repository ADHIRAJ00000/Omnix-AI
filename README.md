# Omnix-AI

Omnix-AI is a multi-agent AI platform built as a set of small Node.js services. A supervisor graph (LangGraph) looks at each incoming request and hands it to the right agent: plain chat, web search, code generation, PDF and slide generation, image/vision, or Q&A over documents the user uploaded. Every run costs credits, and top-ups go through Razorpay.

I built this to learn how a real multi-service backend fits together: auth, queues of state, payments, and an LLM layer on top, instead of one big Express app.

## Architecture

```
   Browser
      |
      v
 +----------+
 |  React   |   (Vite SPA)
 +----+-----+
      | HTTPS + Bearer access token
      v
 +------------------------------------------+
 |  Gateway :8000                           |  only public entry point
 |  verifies JWT, rate limits, routes       |
 +---+--------+---------+---------+---------+
     |        |         |         |
     v        v         v         v
  +------+ +------+ +-------+ +---------+
  | Auth | | Chat | | Agent | | Billing |
  | 8001 | | 8002 | | 8003  | |  8004   |
  +---+--+ +---+--+ +---+---+ +----+----+
      |        |        |          |
      v        v        v          v
   MongoDB / Redis / Qdrant / Gemini + Groq
```

| Service | Port | What it does |
|---|---|---|
| gateway | 8000 | Public entry. Checks access tokens, rate limits, proxies to services, adds a request id. |
| auth | 8001 | Register, login, token rotation, profile, credit ledger. |
| chat | 8002 | Conversations and messages, with ownership checks. |
| agent | 8003 | The LangGraph supervisor and all the agents. |
| billing | 8004 | Plans, Razorpay orders, payment verification. |

Services never touch each other's databases. Internal calls are signed with a shared secret, so even if a service has its own public URL it rejects anything that didn't come through the gateway.

## Some design choices

**Auth.** Access tokens are short-lived (15 min) JWTs, so the gateway can verify them locally without a DB hit. Refresh tokens are opaque, stored hashed in Redis and rotated on every use. Old tokens are kept and marked as used; if one shows up again, that means two copies exist, so the whole token family gets revoked and the user has to log in again.

**Credits.** `user.credits` is just a cached balance for fast reads. The real source of truth is an append-only ledger where entries are never edited, and a reconcile check confirms they add up to the balance. If a run fails, it is refunded by run id and every charge from that run is reversed. This matters because one search request pays for the search agent and then the chat agent, so refunding only the last charge would shortchange the user.

**Idempotency.** Charges, refunds and payment verification are all keyed, so retries, duplicate webhooks and replayed Razorpay callbacks only take effect once.

**Generated files.** PDFs, slide decks and images are stored as bytes in MongoDB and served through expiring HMAC-signed URLs (same idea as S3 presigned links, minus the object storage). Signed URLs are needed because the browser opens these from a markdown link or an `<img>` tag, and neither sends an Authorization header. Documents stay after their link expires so the user sees "link expired" instead of "not found", and a TTL index cleans them up so the free DB tier doesn't fill up.

## Tech stack

Node 24, Express 5, MongoDB (Mongoose), Redis, Qdrant, LangGraph, Gemini / Groq, React 19, Vite, Redux Toolkit, Tailwind, Docker, Vitest

## Running locally

You need Node 24+ and Docker.

```bash
git clone <your-repo-url>
cd omnix-ai/backend

# starts MongoDB and Redis
docker compose up -d

# each service has its own .env
for d in gateway services/auth services/chat services/agent services/billing; do
  cp $d/.env.example $d/.env
done
```

Generate two secrets and paste the same value everywhere they are needed:

```bash
openssl rand -hex 32   # INTERNAL_API_KEY  (all five services)
openssl rand -hex 32   # JWT_ACCESS_SECRET (gateway and auth)
```

In auth, chat, agent and billing, set `MONGODB_URL=mongodb://localhost:27017/omnix-ai`.

Then run each service in its own terminal:

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
cp .env.example .env     # VITE_SERVER_URL=http://localhost:8000
npm install
npm run dev
```

Open http://localhost:5173 and create an account. Sign up and basic navigation work without any API keys. An agent that needs a provider key will tell you which one is missing instead of failing silently.

### API keys

| Key | Used for | Free tier |
|---|---|---|
| `GROQ_API_KEY` | Chat, search and image agents (needed for basic chat) | Yes, console.groq.com |
| `GOOGLE_API_KEY` | Vision agent and RAG embeddings | Yes, aistudio.google.com |
| `OPENROUTER_API_KEY` | Coding agent | Yes, openrouter.ai |
| `TAVILY_API_KEY` | Search agent | Yes, 1000 requests/month |
| `QDRANT_URL`, `QDRANT_API_KEY` | PDF RAG agent | Yes, 1GB on cloud.qdrant.io |
| `RAZORPAY_*` | Billing | Test mode is free |
| `VITE_FIREBASE_*`, `FIREBASE_SERVICE_ACCOUNT` | Google sign-in (optional) | Yes |

Google sign-in needs both sides configured. On the frontend: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID` (Firebase console, Project settings, Your apps). On the auth service: `FIREBASE_SERVICE_ACCOUNT`, the full service-account JSON, which is a real secret. Also add your deployed domain under Authentication, Settings, Authorized domains, otherwise the popup fails with `auth/unauthorized-domain`.

Firebase is only used to prove identity. After that the auth service issues its own tokens, so Google and email/password users share the same session logic.

## Tests

```bash
cd backend
npm test
```

There are 66 tests covering credit accounting, session handling and token reuse detection, conversation access control, payment replay, and one end-to-end run of the agent graph with the model mocked.

Tests use a separate database (`omnix-ai-test`) and Redis index. The suite wipes data between cases, so it refuses to run unless the database name contains `test`.

## Deployment

I deployed the backend on Render, the frontend on Vercel, and used free managed databases. Everything fits in free plans.

**1. Data stores**

- MongoDB: Atlas M0 (free). Allow access from `0.0.0.0/0`, since Render's free plan has no fixed egress IPs.
- Redis: Upstash free tier.
- Qdrant: Qdrant Cloud free 1GB cluster.

**2. Backend**

Push to GitHub, then in Render go to New, Blueprint and point it at `backend/render.yaml`. It creates all five services. Then fill in the env vars Render flags as required:

- `INTERNAL_API_KEY`: same value on all five services
- `JWT_ACCESS_SECRET`: same value on gateway and auth
- `MONGODB_URL`, `REDIS_URL`: from Atlas and Upstash
- Gateway: `AUTH_SERVICE`, `CHAT_SERVICE`, `AGENT_SERVICE`, `BILLING_SERVICE` (the other services' Render URLs) and `CORS_ORIGINS` (your Vercel URL)
- Agent: `CHAT_SERVICE`, `AUTH_SERVICE`, `GATEWAY_URL`
- Billing: `AUTH_SERVICE`
- Provider keys on agent, Razorpay keys on billing

Copy the service URLs from the Render dashboard instead of guessing them. `.onrender.com` names are globally unique, so if a name is taken Render adds a random suffix (for example `omnix-auth` can become `omnix-auth-6bbt`). Using the wrong name sends internal traffic to someone else's deployment.

**3. Frontend**

Import the repo in Vercel, set the root directory to `frontend`, and set `VITE_SERVER_URL` to the gateway's Render URL. `vercel.json` already handles SPA routing and asset caching.

Finally, set `CORS_ORIGINS` on the gateway and `FRONTEND_URL` on auth to your Vercel URL with no trailing slash, and redeploy both. Origins are compared literally, and `FRONTEND_URL` also scopes the refresh cookie. If it is wrong, login seems to work but the session is lost on the next page load.

### Free tier notes

Free Render services sleep after 15 minutes of inactivity and take around 50 seconds to wake up. Since the gateway calls other services, the first request after idle can wake several of them one after another. Free instance hours are also shared across all services, so keeping all five running 24/7 isn't possible.

Options if the cold start bothers you:

- Live with it.
- Keep only the gateway and auth warm with a free uptime pinger.
- Run everything on one always-free VM (Oracle Cloud's ARM instance works) using docker-compose, which removes cold starts completely.

## Repository layout

```
backend/
  gateway/            public entry point
  services/
    auth/             accounts, tokens, credit ledger
    chat/             conversations and messages
    agent/            LangGraph supervisor and agents
    billing/          plans and payments
  shared/             errors, logging, validation, config
  tests/              vitest suites
  docker-compose.yml  mongo + redis for local dev
  render.yaml         backend deploy blueprint

frontend/             React + Vite SPA
```
