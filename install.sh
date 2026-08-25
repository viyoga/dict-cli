#!/usr/bin/env sh
# dict-cli installer — fetches the tool and puts `dict` on your PATH.
#   curl -fsSL https://raw.githubusercontent.com/hiraeth-dev/dict-cli/main/install.sh | sh

set -eu

REPO="hiraeth-dev/dict-cli"
BRANCH="main"
DEST="${DICT_CLI_HOME:-$HOME/.local/share/dict-cli}"
BIN_DIR="${DICT_CLI_BIN:-$HOME/.local/bin}"
NODE_MIN=18

say()  { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m !!\033[0m  %s\n' "$1"; }
die()  { printf '\033[1;31m ✗\033[0m  %s\n' "$1" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "node is required — install it from https://nodejs.org (v${NODE_MIN}+)"

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge "$NODE_MIN" ] || die "node v${NODE_MIN}+ required (you have $(node -v))"

fetch() {
    url="https://raw.githubusercontent.com/${REPO}/${BRANCH}/$1"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$url" -o "$2"
    elif command -v wget >/dev/null 2>&1; then
        wget -qO "$2" "$url"
    else
        die "need curl or wget to download files"
    fi
}

say "installing dict-cli to ${DEST}"
mkdir -p "$DEST" "$BIN_DIR"

for f in dict.js dict-engine.js dict-wordlist.js; do
    say "  fetching ${f}"
    fetch "$f" "${DEST}/${f}"
done

chmod +x "${DEST}/dict.js"
ln -sf "${DEST}/dict.js" "${BIN_DIR}/dict"

case ":$PATH:" in
    *":${BIN_DIR}:"*) ;;
    *) warn "${BIN_DIR} is not on your PATH."
       warn "add this to your shell rc:   export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
esac

printf '\n'
say "done — try it out:"
printf '    %s\n' "dict time" "dict serendipity --all" "dict bonjour -l fr" "dict"
