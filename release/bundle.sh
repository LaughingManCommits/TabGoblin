#!/usr/bin/env bash
# Makes the download for the system it runs on: a folder "tabgoblin" with a Java runtime that has
# only what the server needs, the server's jar, the extension, and a command to start it by; and
# packs it. Both parts have to be built first: nothing is built here.
#
#   bash release/bundle.sh       in bash; on Windows that is Git Bash
#
# It needs a JDK 25 or newer on the path, for jdeps, jlink and jar; on Windows also for jpackage,
# and Node, which writes the icon of the program it makes. The download is written to
# release/out. If TABGOBLIN_RELEASE_VERSION is set, as the release workflow sets it, the version
# in the files has to be that one, or nothing is made.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
jar="$root/java-server/target/tabgoblin.jar"
extension="$root/chrome-extension/dist"
[ -f "$jar" ] || { echo "No server to pack. Build it first: mvn -f java-server/pom.xml package" >&2; exit 1; }
[ -f "$extension/manifest.json" ] || { echo "No extension to pack. Build it first: npm --prefix chrome-extension run build" >&2; exit 1; }

# The manifest's "version" is numbers only, as Chrome wants it; a beta's full name, as
# 0.3.0-beta.1, is its "version_name". The download is named after the full one.
numbers=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$extension/manifest.json" | head -n 1)
[ -n "$numbers" ] || { echo "The extension's manifest names no version." >&2; exit 1; }
version=$(sed -n 's/.*"version_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$extension/manifest.json" | head -n 1)
version=${version:-$numbers}
if [ -n "${TABGOBLIN_RELEASE_VERSION:-}" ] && [ "$TABGOBLIN_RELEASE_VERSION" != "$version" ]; then
  echo "The release is $TABGOBLIN_RELEASE_VERSION, and the version in the files is $version." >&2
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

# JavaFX's native files for this system, in the runtime, where the server tells JavaFX to take them
# from (McpMain.nativeFilesFromDownload). Without them JavaFX unpacks its own from the jar into the
# home folder and loads them from there, and a virus scanner on Windows took that for a program
# that drops code into the user's profile and runs it.
case "$system" in
  windows) suffix=dll ;;
  linux) suffix=so ;;
  macos) suffix=dylib ;;
esac
natives=$(jar --list --file "$jar" | tr -d '\r' | grep -E "^[^/]+\.$suffix\$" || true)
[ -n "$natives" ] || { echo "The jar holds no native files of JavaFX for $system." >&2; exit 1; }
mkdir "$stage/tabgoblin/runtime/tabgoblin-javafx"
# shellcheck disable=SC2086 # one name a word; the names have no spaces
(cd "$stage/tabgoblin/runtime/tabgoblin-javafx" && jar --extract --file "$jar" $natives)

cp "$jar" "$stage/tabgoblin/tabgoblin.jar"
cp -R "$extension" "$stage/tabgoblin/extension"
cp "$root/LICENSE" "$stage/tabgoblin/LICENSE"
cp "$root/release/README.txt" "$stage/tabgoblin/README.txt"
# The documentation as it is for this version, to read offline: the pages, their pictures and
# diagrams, and the few files at the root they link to. Not the pages for agents' sessions.
mkdir -p "$stage/tabgoblin/docs" "$stage/tabgoblin/skills"
cp "$root"/docs/*.md "$stage/tabgoblin/docs/"
cp -R "$root/docs/images" "$root/docs/assets" "$stage/tabgoblin/docs/"
cp "$root/README.md" "$root/CONTRIBUTING.md" "$root/SECURITY.md" "$stage/tabgoblin/"
cp "$root/skills/README.md" "$stage/tabgoblin/skills/README.md"
[ -f "$stage/tabgoblin/docs/installation.md" ] && [ -d "$stage/tabgoblin/docs/images" ] \
  || { echo "The documentation did not get into the download." >&2; exit 1; }
if [ "$system" = windows ]; then
  # The command, and a file to double-click that is that command with --show-token.
  for file in tabgoblin.cmd tabgoblin-token.cmd; do
    cp "$root/release/$file" "$stage/tabgoblin/$file"
  done
  java="$stage/tabgoblin/runtime/bin/java.exe"

  # The program to double-click for the server's window, with the goblin as its icon. The JDK's
  # packaging tool makes it. Of what the tool makes, the program and its settings are taken: the
  # jar and the runtime stay where an agent is told they are, and the settings name that jar.
  made="$out/launcher"
  rm -rf "$made"
  mkdir -p "$made/in"
  cp "$jar" "$made/in/tabgoblin.jar"
  node "$root/art/mascot.ts" --windows-icon "$made/tabgoblin.ico" > /dev/null
  # The program's version is three numbers: a beta's fourth is left out.
  jpackage --type app-image --name TabGoblin --app-version "$(echo "$numbers" | cut -d. -f1-3)" --input "$made/in" \
    --main-jar tabgoblin.jar --runtime-image "$stage/tabgoblin/runtime" \
    --icon "$made/tabgoblin.ico" --arguments --panel --dest "$made/out"
  settings="$made/out/TabGoblin/app/TabGoblin.cfg"
  grep -q '^app\.mainjar=\$APPDIR.tabgoblin\.jar' "$settings" \
    || { echo "The packaging tool's settings do not name the jar as expected: $settings" >&2; exit 1; }
  mkdir "$stage/tabgoblin/app"
  sed 's/^app\.mainjar=\$APPDIR/app.mainjar=$ROOTDIR/' "$settings" > "$stage/tabgoblin/app/TabGoblin.cfg"
  cp "$made/out/TabGoblin/TabGoblin.exe" "$stage/tabgoblin/TabGoblin.exe"
  rm -rf "$made"
else
  cp "$root/release/tabgoblin" "$stage/tabgoblin/tabgoblin"
  chmod +x "$stage/tabgoblin/tabgoblin"
  java="$stage/tabgoblin/runtime/bin/java"
fi

# It has to start on its own runtime, or it is no download.
"$java" -jar "$stage/tabgoblin/tabgoblin.jar" --help | grep -q "TabGoblin MCP server" \
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
