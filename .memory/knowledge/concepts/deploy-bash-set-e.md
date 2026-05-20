---
title: "deploy.sh Must Start with set -euo pipefail"
aliases: [set-euo-pipefail, deploy-bash-safety, bash-exit-on-error, deploy-script-failsafe]
tags: [deployment, bash, gotcha, critical, infra]
sources:
  - "daily/2026-05-20.md"
created: 2026-05-20
updated: 2026-05-20
---

# deploy.sh Must Start with set -euo pipefail

A bash deploy script without `set -euo pipefail` continues executing after any command fails. A failed database migration followed by `docker compose up` silently brings up production containers against a broken schema. Every production deploy script must have `set -euo pipefail` as its first effective line.

## Key Points

- Without `set -e`: a non-zero exit code from any command is silently ignored; subsequent commands run with potentially broken state
- Scenario: migration fails (constraint violation, missing role, syntax error) → without `set -e`, script continues → `docker compose up -d` starts API → API connects to DB with broken schema → production is broken, no error in CI logs
- `set -u`: treats unset variables as errors — catches `${UNSET_VAR}` references that silently expand to empty string without `-u`
- `set -o pipefail`: makes `cmd1 | cmd2` fail if `cmd1` fails — without this, `failing_command | tee output.log` returns 0 (tee succeeded)
- The three flags together: `set -euo pipefail` is the minimum safe baseline for any shell script that modifies state

## Details

Bash's default behavior is permissive: commands that fail (exit non-zero) are recorded in `$?` but execution continues. This is intentional for interactive shells where a failed `cd` should not end the session, but catastrophic for deploy scripts where any failure should halt the deployment.

The Poputchiki `deploy.sh` was missing this safety line. The risk scenario:

```bash
#!/bin/bash
# Without set -euo pipefail:

run_migrations  # fails with "ERROR: relation does not exist"
# Exit code was 1, but bash ignores it

docker compose up -d  # runs anyway
# API starts, connects to DB, immediately crashes on first request
# deploy.sh returns 0 (last command succeeded)
# GitHub Actions marks deploy as SUCCESS
```

With `set -euo pipefail`:

```bash
#!/bin/bash
set -euo pipefail

run_migrations  # fails → bash exits immediately, deploy.sh returns 1
# docker compose up never runs
# GitHub Actions marks deploy as FAILED
# Rollback hook fires
```

**Full deploy.sh skeleton with all safety patterns:**

```bash
#!/bin/bash
set -euo pipefail

# Signal handling: run cleanup on exit
cleanup() {
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo "Deploy failed with exit code $exit_code" >&2
    /opt/poputchiki/scripts/rollback.sh || true
    /opt/poputchiki/scripts/notify-admin.sh "Deploy failed" || true
  fi
}
trap cleanup EXIT

# Rest of deploy logic...
```

The `trap cleanup EXIT` pattern ensures the cleanup function runs whether the script exits normally, via `set -e`, or via `kill`. The `|| true` on cleanup commands prevents cleanup failures from obscuring the original error (without it, a failed `notify-admin.sh` would overwrite the original exit code).

**Companion: deploy lock file against parallel deploys:**

```bash
LOCKFILE=/tmp/poputchiki-deploy.lock
exec 9>"$LOCKFILE"
if ! flock -n 9; then
  echo "Another deploy is running" >&2
  exit 1
fi
```

Without a lock, two simultaneous GHA deploy runs (e.g., from rapid pushes) can interleave and corrupt each other's state — one running migrations while the other restarts containers.

**`set -e` exceptions:** Some commands legitimately return non-zero and should not abort the script (e.g., `docker inspect` returning 1 for "container not running"). Use `command || true` to suppress the error for known-safe failures.

## Related Concepts

- [[concepts/reactive-deploy-fix-loop]] — The 15-failure deploy cascade in 2026-05-13 would have been shorter if `set -e` had made each failure explicit and halted the script, rather than cascading into the next step
- [[concepts/deployment-pipeline]] — `deploy.sh` is the core of the deploy pipeline; this safety flag belongs in every project's deploy script
- [[concepts/docker-compose-run-skips-healthcheck]] — Related deploy script robustness: `docker compose run` needs `--wait` before migrations; `set -e` ensures a failed health-wait also halts the script

## Sources

- [[daily/2026-05-20.md]] — Session 19:45: sector-infra-review finding #1 CRITICAL: `deploy.sh` missing `set -euo pipefail` → failed migration does not halt deploy → `docker compose up` runs anyway → production starts with broken schema; also: no `flock` deploy lock allows parallel deploys to interleave
