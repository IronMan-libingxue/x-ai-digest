---
name: x-ai-tech-digest
description: Fetch reposted posts and personalized recommended posts from a logged-in X/Twitter account, filter for AI, machine learning, software engineering, chips, and computer technology topics, and produce a daily digest or recurring automation output. Use when Codex needs to monitor an X account's reposts or home recommendations, rank relevant tech items, and summarize them into a dated report or inbox update.
---

# X Ai Tech Digest

Collect personalized X content and turn it into a compact Chinese digest. Prefer deterministic scripts for session capture, timeline extraction, scoring, and Markdown generation.

`推荐内容` requires a logged-in X session. Prefer exporting cookies from a locally logged-in Chrome profile. Without login state, only public profile scraping is possible and home recommendations are unavailable.

## Prerequisites

Run these checks once:

```bash
command -v npx >/dev/null 2>&1
command -v node >/dev/null 2>&1
command -v python3 >/dev/null 2>&1
python3 -m pip install --user browser-cookie3
```

Store artifacts under a dated working directory, for example:

```bash
mkdir -p output/x-ai-digest
```

Set the skill path once:

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export XDIGEST="$CODEX_HOME/skills/x-ai-tech-digest"
```

## Workflow

### 1. Export a reusable X login session

Prefer reading cookies from a Chrome profile that is already logged into X:

```bash
python3 "$XDIGEST/scripts/export_x_storage_state.py" \
  --output "$CODEX_HOME/secrets/x-storage-state.json"
```

Fallback only when Chrome cookies are unavailable:

```bash
npx -y -p playwright node \
  "$XDIGEST/scripts/save_x_session.cjs" \
  --output "$CODEX_HOME/secrets/x-storage-state.json"
```

If the file already exists, reuse it. Regenerate only when the session expired.

### 2. Capture candidate posts

Capture from both:

- `home`: treat `For you` as the personalized recommendation feed
- `profile`: inspect the user's profile page and keep reposts from the current local day by default

Use:

```bash
npx -y -p playwright node \
  "$XDIGEST/scripts/capture_x_feed.cjs" \
  --storage-state "$CODEX_HOME/secrets/x-storage-state.json" \
  --handle <x-handle-without-@> \
  --source both \
  --profile-reposts today \
  --limit 40 \
  --output output/x-ai-digest/candidates.json
```

The script writes JSON with normalized fields:

- `source`: `home` or `profile`
- `url`
- `text`
- `author`
- `authorHandle`
- `publishedAt`
- `socialContext`
- `media`
- `externalLinks`
- `capturedAt`

If `profile` produces too many original self-posts, filter more aggressively on `socialContext` or `authorHandle != <handle>`.

### 3. Score and filter for AI / computer tech

Run:

```bash
python3 "$XDIGEST/scripts/build_digest.py" \
  --input output/x-ai-digest/candidates.json \
  --output output/x-ai-digest/digest.md \
  --top 12
```

The scorer favors:

- AI models, agents, inference, GPUs, chips, data centers
- software engineering, compilers, programming languages, cloud/platform tooling
- launches, benchmarks, funding, releases, API changes, major incidents

Read `references/topic-rules.md` only when you need to adjust the keyword heuristics or selection rules.

### 4. Deliver the digest

Use the generated Markdown as the base artifact. Then produce a concise Chinese summary with:

- a short title
- high-level summary of the day
- 5-12 selected items
- one-line reason for each item
- source label: `推荐` or `我的转发`
- original post link
- external links mentioned in the post
- inline images when media exists

If the user asked for recurring delivery, keep the Markdown file on disk and surface the same content in the inbox item.

## Operational Rules

- Prefer reusing `/Users/ironman/.codex/secrets/x-storage-state.json`.
- Fail clearly when login state is missing or expired.
- Keep raw candidates and final digest separate.
- Deduplicate by `url` before ranking.
- Do not include non-tech celebrity, politics, sports, or generic motivation posts unless the tech angle is explicit.
- When an item is ambiguous, keep it only if the reason can be stated in one concrete sentence.

## Resources

- `scripts/export_x_storage_state.py`: export x.com Chrome cookies to Playwright storage state
- `scripts/save_x_session.cjs`: one-time login bootstrap for X
- `scripts/capture_x_feed.cjs`: collect candidate posts from home/profile
- `scripts/build_digest.py`: score, filter, and render Markdown digest
- `references/topic-rules.md`: positive/negative keyword rules and selection guidance
