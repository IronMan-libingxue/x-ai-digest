# x-ai-digest

`x-ai-digest` is a Codex skill that turns your X/Twitter `For you` feed plus same-day reposts into a concise AI and computer-tech digest.

It reads your local Chrome login state, captures candidate posts, filters for AI / engineering / chips / tooling topics, and generates a Markdown brief with:

- daily summary
- selected posts from `For you` and your reposts
- original X links
- external links mentioned in the posts
- inline images when media exists
- final conclusion

## Why Use It

- Track your personal X feed instead of generic news sources
- Combine `For you` recommendations with your own repost signal
- Produce a digest that is easy to review or automate
- Reuse it as a Codex skill or publish it as a recurring workflow

## Repository Layout

- `skill/x-ai-tech-digest/`: the installable Codex skill folder

## Install

### From This Repo

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$CODEX_HOME/skills"
cp -R skill/x-ai-tech-digest "$CODEX_HOME/skills/"
```

### From Release ZIP

1. Download the release zip.
2. Unzip it.
3. Copy the `x-ai-tech-digest` folder into `$CODEX_HOME/skills/`.

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$CODEX_HOME/skills"
cp -R x-ai-tech-digest "$CODEX_HOME/skills/"
```

## Quick Start

Install the Python cookie helper once:

```bash
python3 -m pip install --user browser-cookie3
```

Export your logged-in X session from local Chrome:

```bash
python3 "$CODEX_HOME/skills/x-ai-tech-digest/scripts/export_x_storage_state.py" \
  --output "$CODEX_HOME/secrets/x-storage-state.json"
```

Capture `For you` plus same-day reposts:

```bash
npx -y -p playwright node \
  "$CODEX_HOME/skills/x-ai-tech-digest/scripts/capture_x_feed.cjs" \
  --storage-state "$CODEX_HOME/secrets/x-storage-state.json" \
  --handle YOUR_X_HANDLE \
  --source both \
  --profile-reposts today \
  --limit 40 \
  --scrolls 4 \
  --output output/x-ai-digest/candidates.json
```

Build the digest:

```bash
python3 "$CODEX_HOME/skills/x-ai-tech-digest/scripts/build_digest.py" \
  --input output/x-ai-digest/candidates.json \
  --output output/x-ai-digest/digest-$(date +%F).md \
  --top 12
```

## Typical Output

The generated Markdown digest includes:

- a top-level daily summary
- selected posts with source labels such as `推荐` and `我的转发`
- original post links
- extra links found inside the post
- images when available
- a closing summary section

## Best Fit

Use this when you want to:

- monitor AI builders, coding tools, model releases, and infra chatter on X
- review your own repost signal every day
- generate a private briefing from a personal feed
- wire the workflow into a scheduled Codex automation later
