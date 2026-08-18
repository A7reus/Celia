# Chess Pairing

A small self-hosted Swiss-system chess tournament manager: pair rounds, publish pairings, enter results, and track standings. Built with Next.js (App Router), Turso (or a local SQLite fallback), and a deterministic FIDE-inspired pairing engine.

## Features

- FIDE-inspired Swiss pairing (see [How the tournament works](#how-the-tournament-works)), with byes and color handling
- Round lifecycle: generate (draft) -> publish -> complete (with results)
- Pairing editor before publishing, results entry after publishing
- Standings with tie-breaks: Buchholz, Median Buchholz, Sonneborn-Berger, Koya, direct encounter
- Tournament Performance Rating (TPR) per player
- Manual/FIDE ratings, optional inactive players, fixed number of rounds
- Admin area (password-protected; default password `admin` on a fresh database, change it in Settings)
- Login rate limiting and optional IP allowlist
- Light theme, responsive tables
- Deterministic pairing engine (no randomness), covered by unit tests

## Requirements

- Node.js 22.13+ (needed only for the local `node:sqlite` fallback; production uses Turso)
- pnpm

## Development setup

```bash
git clone <your-repo-url>
cd chess-pairing
pnpm install
cp .env.example .env.local   # optional, see "Environment variables" below
pnpm dev
```

Open http://localhost:3000. Without a `.env.local`, the app creates a local SQLite database on first run at `data/chess.db` (seeded with default settings, admin password `admin`). `/admin` is the admin area.

If you want to develop against the same database you'll use in production, create a Turso database first (see [Deployment](#deployment)), then fill in `.env.local`; the app will use it instead of the local file.

### Environment variables

| Variable             | Required | Description                                                                                                            |
| -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `TURSO_DATABASE_URL` | prod     | Turso database URL (`libsql://...`). If missing (or `TURSO_AUTH_TOKEN` is), the app falls back to a local SQLite file. |
| `TURSO_AUTH_TOKEN`   | prod     | Turso authentication token (read-write, database-scoped).                                                              |
| `ADMIN_IP_ALLOWLIST` | no       | Comma-separated client IPs allowed to log in to `/admin`. When set, any other IP is rejected at login.                 |
| `CHESS_DATA_DIR`     | no       | Directory for the local SQLite fallback (default: `./data`).                                                           |

## Commands

```bash
pnpm dev           # development server
pnpm build         # production build
pnpm start         # run the production build
pnpm test          # engine + scoring + rate-limit tests (vitest)
pnpm lint          # oxlint
pnpm format        # format all files with Prettier
pnpm format:check  # verify formatting (CI)
```

## How the tournament works

### Round lifecycle

A tournament has a fixed number of rounds (configurable in Settings). Each round goes through three states:

1. **Draft**: the engine generates pairings; the admin can edit them on the round page before they are shown publicly.
2. **Published**: pairings are visible on the public pages; results can be entered per board (1-0, 0-1, ½-½, or forfeits).
3. **Completed**: results are final; the round can be reopened if a correction is needed.

Standings are computed from all completed rounds.

### The pairing engine

`src/lib/pairing.ts` is a deterministic, FIDE-inspired Swiss engine:

- **Score groups first.** Players are grouped by exact points: a player with 5 points is never paired below a 4-point group. Within a group, players are ordered by rating (round 1) or by the same tie-break order used for standings.
- **Round 1** pairs the top half against the bottom half (highest vs. middle, mirror style), so the strongest players don't meet immediately.
- **No rematches** (FIDE B.4). Repeats are only allowed as a last resort and are always flagged in the UI.
- **Color rules** (FIDE B.6-B.8): colors alternate as much as possible, color difference never exceeds 2, and no player gets the same color three times in a row.
- **Byes.** With an odd number of players, the lowest-ranked player in the lowest bracket receives a bye (0.5 points, counted as a draw; it also counts 0.5 toward Buchholz). A player receives at most one bye.
- **Search.** Pairing within a bracket is a most-constrained-first backtracking search with a mirror-pairing bias. A cost function penalizes rematches more than color violations, so color rules are relaxed only when a strict-color pairing doesn't exist; every relaxation is surfaced as a warning.
- **Deadlocks.** If a bracket cannot be paired, it merges with the neighboring bracket (bottom brackets merge upward in a pre-pass; a deadlocked bracket merges downward) and the search retries. Large pools get a best-effort iteration budget so pairing stays fast.

### Scoring and standings

`src/lib/scoring.ts`:

- Win = 1 point, draw = ½, loss = 0; a bye counts as a draw (½ point).
- **Ranking is strictly by points.** Tie-breaks are only applied between players with equal points, in this order:
  1. Buchholz (sum of opponents' scores)
  2. Median Buchholz (Buchholz minus best and worst opponent scores)
  3. Sonneborn-Berger (sum of defeated opponents' scores + half the drawn opponents' scores)
  4. Koya (points scored against opponents with 50% or more)
  5. Wins (more decisive wins)
  6. Rating
  7. Direct encounter (head-to-head result)
- **TPR** (Tournament Performance Rating) uses the FIDE 400 formula: average opponent rating + 400 x (wins - losses) / games, clamped to +/-400. Only shown for players who have played.

## Implementation overview

### Architecture

```
src/
  app/               Next.js App Router pages (server components)
    page.tsx         standings (crosstable with per-round results)
    not-found.tsx    custom 404 page
    pairings/        latest published round + per-round pairing pages
    results/         results of completed rounds
    players/[id]/    individual player page (stats, game history)
    admin/           login, dashboard, players, settings, simulation
    admin/(protected)/rounds/[n]/  pairing editor + results form
  components/        tables, forms, status pills, buttons
  lib/
    db.ts            database adapter (Turso remote / SQLite fallback)
    pairing.ts       the pairing engine (pure, deterministic)
    scoring.ts       standings, tie-breaks, TPR (pure)
    auth.ts          password hashing, sessions, login rate limiting
    actions.ts       server actions (all writes go through these)
  types/             shared types (type aliases only)
  tests/             vitest tests (pairing engine, scoring, rate limiting)
```

- **Server components** fetch data and render; all state changes happen through **server actions** (`src/lib/actions.ts`), which revalidate affected routes after every write.
- The **pairing engine and scoring are pure functions** over plain data structures, which makes them unit-testable without a database.

### Data model

SQLite schema (Turso and local fallback share it, created idempotently at startup):

- `settings`: key/value store: tournament name, time control, round count, default rating, admin password hash, session secret.
- `players`: name, rating, rating type (manual/FIDE), active flag.
- `rounds`: number + status (draft/published/completed).
- `pairings`: per round and board: white/black player, result, bye flag.
- `login_limits`: per-IP failed-login tracking for rate limiting.

### Database adapter

`src/lib/db.ts` exposes a single async `DbHandle` interface (`all`/`get`/`run`/`exec`/`batch`) with two implementations:

- **Remote:** `@tursodatabase/serverless` (compat API) against Turso, used when `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are set.
- **Local:** `node:sqlite` `DatabaseSync` at `data/chess.db` (or `CHESS_DATA_DIR`), used when the env vars are absent (the development fallback).

The handle is cached per process. Because all queries go through the same interface, swapping between Turso and local SQLite is invisible to the rest of the app.

### Authentication and security

- Passwords are hashed with **scrypt** (random salt, 64-byte key) and compared with `timingSafeEqual`.
- Sessions are **stateless HMAC-SHA256 tokens** (30-day expiry) stored in an httpOnly, SameSite=Lax cookie; verification is `timingSafeEqual` on the signature.
- **Login rate limiting:** after 5 failed attempts from the same IP (from `x-forwarded-for`), login is locked with exponential backoff (5 to 60 minutes). Locks expire after 15 minutes of inactivity and are cleared on success. Attempts during a lockout are rejected before password verification.
- **Optional IP allowlist:** with `ADMIN_IP_ALLOWLIST` set, login is only accepted from the listed IPs.
- Server actions inherit Next.js's built-in origin/host checks (CSRF protection).
- `_headers` (Netlify edge config): security headers site-wide (CSP, frame/clickjacking protection, nosniff, no-referrer, HSTS) and `Cache-Control: no-store` + `noindex` on `/admin/*`.

### UI patterns

- **Standings table** shows a crosstable: each round cell displays the player's own result, colored green (win) / amber (draw) / red (loss).
- **Loading indicators**: `loading.tsx` boundaries at the root and the dynamic segments (`pairings/[round]`, `players/[id]`, admin rounds) show an instant spinner while the next page streams in, so every navigation gives feedback.
- **Pairing editor** (admin) lets you swap players between boards before publishing; **regenerate** validates the plan and produces a fresh one with warnings.
- **Forms** use `useActionState`: `ActionForm` renders server-action errors and success messages; destructive actions use `ConfirmSubmitButton` (confirm dialog + pending state).

### Tests

`src/tests/engine.test.ts` (vitest): pairing invariants over 7 rounds for 8-40 players (colors, rematches, byes), round-1 pairing shape, bye assignment, hand-verified standings (Buchholz, TPR, bye scoring, head-to-head). `src/tests/rate-limit.test.ts`: lockout behavior against an isolated temp database.

## Deployment

The app is designed for **Netlify + Turso** (the database is remote, so serverless is fine; the local SQLite path is only a development fallback).

1. Create a Turso database: `turso db create chess-tournament` and get its URL + a read-write token (`turso db tokens create <db>`).
2. On Netlify: add the site, point it at the repo, set the build command to `pnpm build` and the install command to `pnpm install`.
3. Set environment variables in Netlify: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and optionally `ADMIN_IP_ALLOWLIST`. The schema and seed are created automatically on first request.
4. The `_headers` file is picked up automatically by Netlify (security headers + no-store on admin).
5. Optional hardening in the Netlify dashboard: DDoS protection (built-in), IP blocking, and site password protection for `/admin`.

The default admin password on a fresh database is `admin`; change it immediately in Admin -> Settings.
