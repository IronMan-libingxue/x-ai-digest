# x-ai-tech-digest

A Codex skill for collecting X/Twitter `For you` recommendations plus same-day reposts, filtering for AI and computer-tech topics, and generating a Markdown digest with summaries, links, and images.

## Repository Layout

- `skill/x-ai-tech-digest/`: the actual skill folder to install under `$CODEX_HOME/skills/`

## Install From ZIP

1. Download the release zip.
2. Unzip it.
3. Copy the `x-ai-tech-digest` folder into `$CODEX_HOME/skills/`.

Example:

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$CODEX_HOME/skills"
cp -R x-ai-tech-digest "$CODEX_HOME/skills/"
```

## Install From This Repo

```bash
export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
mkdir -p "$CODEX_HOME/skills"
cp -R skill/x-ai-tech-digest "$CODEX_HOME/skills/"
```

## Minimal Usage

Prerequisite:

```bash
python3 -m pip install --user browser-cookie3
```

Export Chrome login state:

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

## Output

The digest includes:

- daily summary
- selected posts with source labels
- original X links
- external links found in the post
- inline images when media exists
- final conclusion
