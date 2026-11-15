# Shared setup for agent Stop hooks. Source it; do not run it.
# Codex and Claude Code both send hook input as JSON on stdin and read
# {"continue":true} or {"decision":"block","reason":...} from stdout.

cd "$(git rev-parse --show-toplevel)"

allow_stop() {
  echo '{"continue":true}'
  exit 0
}

# Fixed-string block; used only when jq is unavailable.
if ! command -v jq >/dev/null 2>&1; then
  echo '{"decision":"block","reason":"jq is required for agent hooks. Install it: sudo apt install jq"}'
  exit 0
fi

hook_input="$(cat)"
if [[ -n "$hook_input" && "$(jq -r '.stop_hook_active // false' <<<"$hook_input" 2>/dev/null)" == "true" ]]; then
  # A previous Stop hook already blocked this turn; do not loop.
  allow_stop
fi

# block_stop MESSAGE [LOG_FILE]: block with MESSAGE plus the last 30 log lines.
block_stop() {
  local log_tail=""
  if [[ -n "${2:-}" && -s "$2" ]]; then
    log_tail="$(tail -n 30 "$2")"
  fi
  jq -n --arg message "$1" --arg log_tail "$log_tail" \
    '{decision: "block", reason: (if $log_tail == "" then $message else $message + "\n\n" + $log_tail end)}'
  exit 0
}
