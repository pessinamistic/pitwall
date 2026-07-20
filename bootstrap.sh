#!/usr/bin/env bash
# Thin entry point: forwards all arguments to the real installer, scripts/install.sh.
# Kept intentionally minimal — do not add install logic here; edit scripts/install.sh.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/install.sh" "$@"
