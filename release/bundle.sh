#!/usr/bin/env bash
# Makes the download for the system it runs on: a folder "tabgoblin" with a Java runtime that has
# only what the server needs, the server's jar, the extension, and a command to start it by; and
# packs it. Both parts have to be built first: nothing is built here.
#
#   bash release/bundle.sh       in bash; on Windows that is Git Bash
#
# It needs a JDK 25 or newer on the path, for jdeps, jlink and jar. The download is written to
# release/out. In a run for a version tag, where GitHub sets GITHUB_REF_TYPE and
# GITHUB_REF_NAME, the tag has to be the version with a v in front, or nothing is made.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
jar="$root/java-server/target/browser-context-mcp.jar"
extension="$root/chrome-extension/dist"
[ -f "$jar" ] || { echo "No server to pack. Build it first: mvn -f java-server/pom.xml package" >&2; exit 1; }
[ -f "$extension/manifest.json" ] || { echo "No extension to pack. Build it first: npm --prefix chrome-extension run build" >&2; exit 1; }

version=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$extension/manifest.json" | head -n 1)
[ -n "$version" ] || { echo "The extension's manifest names no version." >&2; exit 1; }
if [ "${GITHUB_REF_TYPE:-}" = "tag" ] && [ "${GITHUB_REF_NAME:-}" != "v$version" ]; then
  echo "The tag is ${GITHUB_REF_NAME:-}, and the version in the files is $version: the tag of this release is v$version." >&2
  exit 1
fi

case "$(uname -s)" in
  Linux*) system=linux ;;
  Darwin*) system=macos ;;
  MINGW*|MSYS*|CYGWIN*) system=windows ;;
  *) echo "No download is made for $(uname -s)." >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) machine=x64 ;;
  arm64|aarch64) machine=arm64 ;;
  *) echo "No download is made for $(uname -m)." >&2; exit 1 ;;
esac
name="tabgoblin-$version-$system-$machine"

out="$root/release/out"
stage="$out/stage"
rm -rf "$stage"
mkdir -p "$stage/tabgoblin"

# The runtime: the modules the jar uses, and no more.
modules=$(jdeps --multi-release 25 --ignore-missing-deps --print-module-deps "$jar" | tail -n 1)
echo "Java modules: $modules"
jlink --add-modules "$modules" --strip-debug --no-header-files --no-man-pages --compress zip-6 \
  --output "$stage/tabgoblin/runtime"

cp "$jar" "$stage/tabgoblin/browser-context-mcp.jar"
cp -R "$extension" "$stage/tabgoblin/extension"
cp "$root/LICENSE" "$stage/tabgoblin/LICENSE"
cp "$root/release/README.txt" "$stage/tabgoblin/README.txt"
if [ "$system" = windows ]; then
  # The command, and two files to double-click that are that command with one option each.
  for file in tabgoblin.cmd tabgoblin-window.cmd tabgoblin-token.cmd; do
    cp "$root/release/$file" "$stage/tabgoblin/$file"
  done
  java="$stage/tabgoblin/runtime/bin/java.exe"
else
  cp "$root/release/tabgoblin" "$stage/tabgoblin/tabgoblin"
  chmod +x "$stage/tabgoblin/tabgoblin"
  java="$stage/tabgoblin/runtime/bin/java"
fi

# It has to start on its own runtime, or it is no download.
"$java" -jar "$stage/tabgoblin/browser-context-mcp.jar" --help | grep -q "TabGoblin MCP server" \
  || { echo "The server does not start on the runtime that was made for it." >&2; exit 1; }

rm -f "$out/$name.zip" "$out/$name.tar.gz"
if [ "$system" = windows ]; then
  # The JDK's own tool writes a zip, and Windows needs no file modes in it.
  (cd "$stage" && jar --create --no-manifest --file "$out/$name.zip" tabgoblin)
  packed="$out/$name.zip"
else
  # A tar keeps the modes: the runtime's programs and the launcher have to stay executable.
  tar -czf "$out/$name.tar.gz" -C "$stage" tabgoblin
  packed="$out/$name.tar.gz"
fi
rm -rf "$stage"
echo "Made $packed"
