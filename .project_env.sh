git_worktree_remove() {
  if [ "$#" -ne 1 ]; then
    echo "Usage: git_worktree_remove <worktree-path>" >&2
    return 2
  fi

  local worktree_path
  if ! worktree_path="$(cd "$1" 2>/dev/null && pwd -P)"; then
    echo "Worktree path does not exist: $1" >&2
    return 2
  fi

  local registered_worktrees
  registered_worktrees="$(git -C "$worktree_path" worktree list --porcelain 2>/dev/null)" || {
    echo "Not a Git worktree: $worktree_path" >&2
    return 2
  }

  local main_worktree_path
  main_worktree_path="$(printf '%s\n' "$registered_worktrees" | sed -n 's/^worktree //p' | head -n 1)"
  if [ "$worktree_path" = "$main_worktree_path" ]; then
    echo "Refusing to remove the main worktree: $worktree_path" >&2
    return 2
  fi

  if ! printf '%s\n' "$registered_worktrees" | sed -n 's/^worktree //p' | grep -Fxq "$worktree_path"; then
    echo "Not a registered Git worktree: $worktree_path" >&2
    return 2
  fi

  if [ ! -f "$worktree_path/compose.yaml" ]; then
    echo "Compose file not found: $worktree_path/compose.yaml" >&2
    return 2
  fi

  local compose_project_name
  compose_project_name="$(basename "$worktree_path")"

  echo "This will permanently delete Docker volumes for Compose project '$compose_project_name'."
  echo "It will then remove Git worktree: $worktree_path"
  read -r -p "Continue? [y/N] " confirmation
  if [ "$confirmation" != "y" ] && [ "$confirmation" != "Y" ]; then
    echo "Cancelled."
    return 0
  fi

  docker compose \
    --project-directory "$worktree_path" \
    --project-name "$compose_project_name" \
    --file "$worktree_path/compose.yaml" \
    down --volumes --remove-orphans || return $?

  git -C "$main_worktree_path" worktree remove -- "$worktree_path"
}
