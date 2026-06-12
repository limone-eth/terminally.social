#!/usr/bin/env bash
# terminally.social one-shot installer — for humans and Claude agents.
#
#   curl -fsSL https://raw.githubusercontent.com/limone-eth/terminally.social/main/bin/bootstrap.sh \
#     | bash -s -- <username> [--emoji 🦊] [--server <url>] [--invite <code>]
#
# Idempotent: clones (or updates) the repo to ~/.terminally-social, installs the
# one dependency, registers you (first run only), wires the Claude Code
# statusline + hooks (with a settings.json backup), accepts an invite code if
# given, and installs the terminally.social skill so future agents can manage it.
set -euo pipefail

REPO_URL="https://github.com/limone-eth/terminally.social"
REPO_DIR="${TERMINALLY_SOCIAL_DIR:-$HOME/.terminally-social}"
DEFAULT_SERVER="https://terminally.social"

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

if [ ! -f "$HOME/.config/terminally-social/config.json" ]; then
  # no username given: prompt the human if a terminal is attached (works even
  # under `curl | bash`), otherwise tell the driving agent to go ask its user
  if [ -z "$USERNAME" ] && sh -c ': < /dev/tty' 2>/dev/null; then
    while :; do
      printf "pick a username (lowercase letters/digits/_/-, 2-20 chars): " > /dev/tty
      read -r USERNAME < /dev/tty || USERNAME=""
      printf '%s' "$USERNAME" | grep -Eq '^[a-z0-9_-]{2,20}$' && break
      echo "invalid username, try again" > /dev/tty
    done
    printf "pick a profile emoji (enter for 🙂): " > /dev/tty
    read -r EMOJI < /dev/tty || EMOJI=""
    [ -n "$EMOJI" ] && EXTRA_ARGS+=(--emoji "$EMOJI")
    if [ -z "$INVITE" ]; then
      printf "invite code from a friend (enter to skip): " > /dev/tty
      read -r INVITE < /dev/tty || INVITE=""
    fi
  fi
  if [ -z "$USERNAME" ]; then
    cat <<'MSG'
✋ no username provided and no interactive terminal available.

IF YOU ARE A CODING AGENT (Claude Code, etc.) running this for your user:
do not pick a name yourself — ask your user three questions:
  1. a username (lowercase, 2-20 chars of a-z 0-9 _ -)
  2. a profile emoji
  3. (optional) an invite code from a friend, to connect immediately
then re-run exactly:
  curl -fsSL https://raw.githubusercontent.com/limone-eth/terminally.social/main/bin/bootstrap.sh \
    | bash -s -- <username> --emoji <emoji> [--invite <code>]

IF YOU ARE A HUMAN: re-run the same command with your username and emoji.
MSG
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
  cp -R skills/terminally-social "$HOME/.claude/skills/" 2>/dev/null || true
  echo "▸ installed the terminally.social skill (~/.claude/skills/terminally-social)"
fi

echo
echo "done — every new Claude Code session now shows the friends notch."
echo "next:  node $REPO_DIR/client/presence.js invite     # befriend someone"
echo "       node $REPO_DIR/client/presence.js spinner on # friends in spinner tips"
