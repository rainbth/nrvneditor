#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf 'Uso: %s [--help] [--app <path>]\nInstala release/mac-arm64/nrvn.app (o release/mac/nrvn.app) en /Applications/nrvn.app.\n' "${0##*/}"
}

if [[ ${1:-} == --help ]]; then usage; exit 0; fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP=""
while (($#)); do
  case "$1" in
    --app) [[ $# -ge 2 ]] || { echo 'Falta path para --app' >&2; exit 1; }; APP="$2"; shift 2 ;;
    *) echo "Opción desconocida: $1" >&2; usage >&2; exit 1 ;;
  esac
done
if [[ -z "$APP" ]]; then
  for candidate in "$ROOT/release/mac-arm64/nrvn.app" "$ROOT/release/mac/nrvn.app"; do
    if [[ -d "$candidate" ]]; then APP="$candidate"; break; fi
  done
fi
[[ -n "$APP" && -d "$APP" ]] || { echo 'No se encontró nrvn.app; usa --app <path>.' >&2; exit 1; }
TARGET="/Applications/nrvn.app"
if [[ "$APP" -ef "$TARGET" ]]; then
  echo 'La fuente no puede ser el bundle instalado /Applications/nrvn.app.' >&2
  exit 1
fi
PLIST="/usr/libexec/PlistBuddy"
version="$($PLIST -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")"
installed="$HOME/Applications/nrvn.app"
if [[ -d "$installed" ]]; then
  installed_version="$($PLIST -c 'Print :CFBundleShortVersionString' "$installed/Contents/Info.plist")"
  [[ "$installed_version" == "$version" ]] || { echo "Conflicto: ~/Applications/nrvn.app es versión $installed_version; built=$version." >&2; exit 1; }
fi
for candidate in "$ROOT"/release/mac*/nrvn.app; do
  [[ -d "$candidate" && "$candidate" != "$APP" ]] || continue
  other_version="$($PLIST -c 'Print :CFBundleShortVersionString' "$candidate/Contents/Info.plist")"
  [[ "$other_version" == "$version" ]] || { echo "Conflicto: $candidate es versión $other_version; built=$version." >&2; exit 1; }
done
osascript -e 'tell application "nrvn" to quit' >/dev/null 2>&1 || true
STAGING="/Applications/.nrvn-staging-$$.app"
trap 'rm -rf "$STAGING"' EXIT
rm -rf "$STAGING"
ditto "$APP" "$STAGING"
staged_version="$($PLIST -c 'Print :CFBundleShortVersionString' "$STAGING/Contents/Info.plist")"
[[ "$staged_version" == "$version" ]] || { echo "La versión staged ($staged_version) no coincide con la compilada ($version)." >&2; exit 1; }
rm -rf "$TARGET"
mv "$STAGING" "$TARGET"
installed_version="$($PLIST -c 'Print :CFBundleShortVersionString' "$TARGET/Contents/Info.plist")"
[[ "$installed_version" == "$version" ]] || { echo "La versión instalada ($installed_version) no coincide con la compilada ($version)." >&2; exit 1; }
open "$TARGET"
echo "nrvn $version instalado en /Applications/nrvn.app"
