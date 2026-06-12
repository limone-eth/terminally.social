#!/usr/bin/env bash
# claude-presence one-shot installer — for humans and Claude agents.
#
#   curl -fsSL https://raw.githubusercontent.com/limone-eth/claude-presence/main/bin/bootstrap.sh \
#     | bash -s -- <username> [--emoji 🦊] [--server <url>] [--invite <code>]
#
# Idempotent: clones (or updates) the repo to ~/.claude-presence, installs the
# one dependency, registers you (first run only), wires the Claude Code
# statusline + hooks (with a settings.json backup), accepts an invite code if
# given, and installs the claude-presence skill so future agents can manage it.
set -euo pipefail

REPO_URL="https://github.com/limone-eth/claude-presence"
REPO_DIR="${CLAUDE_PRESENCE_DIR:-$HOME/.claude-presence}"
DEFAULT_SERVER="https://claude-presence.vercel.app"

USERNAME="${1:-}"
[ $# -gt 0 ] && shift
SERVER="$DEFAULT_SERVER"
EXTRA_ARGS=()
INVITE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --server) SERVER="$2"; shift 2 ;;
    --invite) INVITE="$2"; shift 2 ;;
    *) EXTRA_ARGS+=("$1" "${2:-}"); shift 2 ;;
  esac
done

command -v node >/dev/null || { echo "node >= 20 is required"; exit 1; }
command -v git >/dev/null || { echo "git is required"; exit 1; }

if [ -d "$REPO_DIR/.git" ]; then
  echo "▸ updating $REPO_DIR ..."
  git -C "$REPO_DIR" pull -q --ff-only || true
else
  echo "▸ cloning to $REPO_DIR ..."
  git clone -q "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"
npm install --omit=dev --silent --no-fund --no-audit

if [ ! -f "$HOME/.config/claude-presence/config.json" ]; then
  if [ -z "$USERNAME" ]; then
    echo "usage: bootstrap.sh <username> [--emoji 🦊] [--server <url>] [--invite <code>]"
    exit 1
  fi
  echo "▸ registering as $USERNAME on $SERVER ..."
  node client/presence.js register "$USERNAME" --server "$SERVER" ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}
else
  echo "▸ already registered — keeping existing identity"
fi

if [ -n "$INVITE" ]; then
  echo "▸ accepting invite ..."
  node client/presence.js add "$INVITE" || true
fi

echo "▸ wiring Claude Code statusline + hooks (settings.json is backed up) ..."
node bin/install.js

if [ -d "$HOME/.claude" ]; then
  mkdir -p "$HOME/.claude/skills"
  cp -R skills/claude-presence "$HOME/.claude/skills/" 2>/dev/null || true
  echo "▸ installed the claude-presence skill (~/.claude/skills/claude-presence)"
fi

echo
echo "done — every new Claude Code session now shows the friends notch."
echo "next:  node $REPO_DIR/client/presence.js invite     # befriend someone"
echo "       node $REPO_DIR/client/presence.js spinner on # friends in spinner tips"
