# VoteSphere API

VoteSphere is a national-scale electronic voting platform for Pakistan. This repository is the backend service: voter onboarding, party and candidate lifecycle, constituency allocation, live vote tallying, and a tamper-evident vote audit trail enforced at the database layer.

The service is designed to run as a single containerized workload on AWS, backed by managed PostgreSQL, with Redis handling real-time coordination and caching. It is currently deployed and serving in production on EC2.

## Platform overview

- **Runtime** — Node.js 22, ES modules, zero build step
- **API framework** — Express 5.1 with a thin layered architecture (routes → middleware → controllers → models)
- **Database** — PostgreSQL on AWS RDS, raw SQL through a connection pool (no ORM; queries are deliberate and index-backed)
- **Coordination layer** — Redis: rate limiting, login throttling, OTP issuance, query caching, and the Socket.IO pub/sub adapter
- **Real-time** — Socket.IO for live leaderboard streaming to connected clients
- **Integrity** — SHA-256 hash-chained ballots with on-demand chain verification
- **Validation** — Zod schemas enforced at the API boundary
- **Media** — Cloudinary for candidate and party imagery
- **Notifications** — transactional email via Gmail SMTP (OTPs, vote receipts)
- **API documentation** — Swagger UI at `/api-docs`

## System architecture

```
                              ┌─────────────────────────────────────────────┐
                              │                   Client                     │
                              └──────────────┬──────────────────┬────────────┘
                                             │  HTTP/REST       │  WebSocket
                                             ▼                  ▼
                             ┌────────────────────────┐   ┌──────────────────────────────┐
                             │        Express         │   │         Socket.IO            │
                             │  routing, middleware,  │──▶│  leaderboardUpdate events    │
                             │  validation, swagger   │   │  room const-<area>-<election>│
                             └──────────┬─────────────┘   └──────────────┬───────────────┘
                                        │                                │  Redis pub/sub
                                        ▼                                ▼
                             ┌────────────────────────┐   ┌──────────────────────────────┐
                             │       Controllers      │──▶│            Redis             │
                             │  request orchestration │   │  rate limits · lockout · OTP │
                             │  + query caching       │   │  query cache · socket adapter│
                             └──────────┬─────────────┘   └──────────────────────────────┘
                                        │
                                        ▼
                             ┌────────────────────────┐
                             │         Models         │
                             │  SQL + transactions    │
                             └──────────┬─────────────┘
                                        │
                                        ▼
                             ┌────────────────────────┐
                             │   PostgreSQL (AWS RDS) │
                             └────────────────────────┘
```

The request path is intentionally linear: **routes** declare the surface, **middleware** enforce authentication, validation, and rate limits, **controllers** orchestrate business flow and cache hot reads in Redis, and **models** own all SQL and transactions. Every layer is replaceable without disturbing the others.

### Module layout

```
server.js              Bootstrap: schema init, seed, middleware chain, routes, socket handlers
config/                Connection pools and client construction (Postgres, Redis)
routes/                Public, user, party, and admin API groups
controllers/           Business flow orchestration + Redis caching
models/                Table definitions, SQL, and transactions
middleware/            JWT authentication, Zod validation, error handling
validation/            Zod request schemas
utils/                 Seeding, CSV parsing, Cloudinary, email, seat resolution logic
demoData/              Seed sources (CSV + JSON)
```

## Data model

Twelve tables are created at startup in dependency order, with foreign keys mirroring the real-world hierarchy:

```
province ──▶ city ──▶ area            constituency ──┬── constituency_area
  ▲          ▲         ▲                  ▲          │      ▲
  │          │         │                  │          └──────┘
  │          │         └──────────┐       │
  │          └──────┐             │       │
  │                 ▼             ▼       │
  │              users            │       │
  │                 ▲             │       │
  │                 │ userId      │       │
  party ─────────▶ candidate ────▶ candidateConstituency
                        ▲               │ totalVotes
                        │               │
  elections ───────────┴───────────────┘
      ▲
      │
  votes (user, candidateConstituency, election, hash chain)
```

| Table | Responsibility |
|---|---|
| `province`, `city`, `area` | Geographic hierarchy, forming a strict FK chain |
| `constituency`, `constituency_area` | National/Provincial seats mapped to areas (many-to-many) |
| `users` | Voters, candidates, and admins with role and verification state |
| `party` | Party accounts with an approval workflow |
| `elections` | Election sessions scoped by seat type and province |
| `candidate` | Party members contesting elections |
| `candidateConstituency` | Seat allocations with a running vote tally |
| `votes` | Ballots, hash-chained for integrity |
| `audit_logs` | Append-only record of every significant action |

### Vote integrity

Ballots are chained so the ledger is verifiable end to end:

- The first ballot links to a fixed genesis value.
- Each ballot stores `previous_hash` and a `current_hash` derived from the prior hash plus the ballot's own content.
- A `UNIQUE(userId, electionId)` constraint makes double voting impossible at the database level.
- `GET /api/admin/verify/integrity/:electionId` walks the chain and reports the ledger state.

Integrity is enforced by the schema, not by application discipline.

## API surface

Routes mount after schema initialization and seeding on boot.

| Group | Auth | Responsibility |
|---|---|---|
| `/api/public/*` | none | Reference data, elections, results, password reset, health |
| `/api/users/*` | JWT | Registration, sign-in, voting, voting history, profile |
| `/api/parties/*` | JWT | Party accounts, candidate management, seat selection |
| `/api/admin/*` | JWT + OTP MFA | CSV imports, election management, integrity, audit, results |

Interactive reference at `/api-docs` (Swagger UI).

## AWS deployment

```
┌────────────────────────────── EC2 host ──────────────────────────────┐
│  docker compose                                                      │
│    backend   ← image from AWS ECR (e-voting-api:latest)              │
│    redis     ← redis:8-alpine (coordination sidecar)                 │
└───────┬──────────────────────────────────────────────────────────────┘
        │
        ▼
  AWS RDS ── PostgreSQL, SSL enforced
        ▲
        │  image hosting      email delivery
        │  ▼                  ▼
        └── Cloudinary        Gmail SMTP (app credentials)
```

| Service | Role in the platform | Configuration |
|---|---|---|
| **Amazon RDS (PostgreSQL)** | Primary datastore. SSL is always enabled for the connection. | `config/db.js` via `DB_*` environment variables |
| **Amazon ECR** | Container registry; the running image is pulled from here. | `docker-compose.yml` |
| **Redis** | Socket.IO adapter, rate-limit store, login lockout, OTP state, and hot-path query cache. | `config/redis.js`, `config/rateLimits.js` |
| **Cloudinary** | Durable image hosting for candidate and party media. | `utils/imgUloader.js` |
| **Gmail SMTP** | Transactional email for OTPs and vote receipts. | `utils/emailservice.js` |

PostgreSQL runs as a fully managed RDS instance outside the compose stack; Redis runs alongside the backend on the host as the only direct dependency. The backend is stateless with respect to votes — all mutable state lives in RDS and Redis — so horizontal scaling is a matter of running more containers behind a load balancer.

## Deploying

```bash
# Build and push the image to ECR
docker build -t 960828422057.dkr.ecr.us-east-1.amazonaws.com/e-voting-api:latest .
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 960828422057.dkr.ecr.us-east-1.amazonaws.com
docker push 960828422057.dkr.ecr.us-east-1.amazonaws.com/e-voting-api:latest

# On the EC2 host, with .env in place
docker compose up -d
```

The image runs as a non-root user and ships the seed dataset so a fresh environment becomes fully populated on first boot.

## Environment configuration

The service is configured entirely through environment variables, loaded at runtime:

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | RDS PostgreSQL connection |
| `SECRET_KEY` | JWT signing secret |
| `GMAIL_ID`, `GMAIL_PASSWORD` | SMTP application credentials |
| `SOCKET_CORS_ORIGIN` | Socket.IO CORS origin (defaults to `*`) |

## Seeding

On startup the service initializes the schema — including four admin accounts — then seeds reference and demo data: 5 provinces, 37 cities, 165 areas, 8 parties, 20 voters, 16 candidates, 74 constituencies, and 3 elections. Seeding is idempotent by design: inserts use `ON CONFLICT DO NOTHING`, so restarts and redeploys never duplicate or destroy data. Completed elections in the seed set ship with a populated vote chain so the integrity flow is demonstrable immediately.

## Design decisions worth knowing

- **Raw SQL over an ORM.** The data layer is small and the queries are hot and specific. Owning the SQL keeps every query indexable and leaves no query-generation surprises in a system where correctness matters.
- **Redis as a coordination backbone, not just a cache.** Rate limiting, lockout state, OTPs, and the real-time adapter all share one operational dependency, which keeps the runtime topology simple and the failure modes few.
- **Hash chaining at the schema level.** Tamper resistance is not a service feature bolted on after the fact — it is part of the ballot table's contract.
- **Idempotent boot.** Schema init and seeding run on every startup, which makes environments reproducible and deploys safe to repeat.
- **Asynchronous receipts.** Vote confirmation emails are dispatched without blocking the cast-vote response, so mail delivery never stands between a voter and their confirmation.
