#!/usr/bin/env bash
# Deploy supabase/functions/join-league to project gtqyvnkkjiksmmtmzubw.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_REF="gtqyvnkkjiksmmtmzubw"

cd "$ROOT"

if command -v supabase >/dev/null 2>&1; then
  CLI=(supabase)
elif [[ -x "$HOME/.local/bin/supabase" ]]; then
  CLI=("$HOME/.local/bin/supabase")
else
  CLI=(npx supabase)
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]] && ! "${CLI[@]}" projects list >/dev/null 2>&1; then
  echo "Supabase CLI is not logged in."
  echo ""
  echo "Run once (browser opens):"
  echo "  ${CLI[*]} login"
  echo ""
  echo "Or set a personal access token from https://supabase.com/dashboard/account/tokens:"
  echo "  export SUPABASE_ACCESS_TOKEN=sbp_..."
  exit 1
fi

echo "Using: ${CLI[*]}"
"${CLI[@]}" link --project-ref "$PROJECT_REF" 2>/dev/null || true
"${CLI[@]}" functions deploy join-league --project-ref "$PROJECT_REF"
echo "Done. Check Supabase dashboard → Edge Functions → join-league"
