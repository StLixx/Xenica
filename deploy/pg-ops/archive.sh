#!/bin/sh
# 只确认已经原子落盘的 WAL；重试不得覆盖不同内容。
set -eu
umask 077
src=$1
name=$2
case "$name" in
  *[!0-9A-Fa-f.backuphistory]*) exit 2 ;;
esac
printf '%s\n' "$name" | grep -Eq '^([0-9A-F]{24}|[0-9A-F]{8}\.history|[0-9A-F]{24}\.[0-9A-F]{8}\.backup)$' || exit 2
root=$(dirname "$0")/archive
mkdir -p "$root"
target=$root/$name.gz
if [ -f "$target" ]; then
  old=$(gzip -dc "$target" | sha256sum | cut -d ' ' -f 1)
  new=$(sha256sum "$src" | cut -d ' ' -f 1)
  [ "$old" = "$new" ] || exit 1
  exit 0
fi
tmp=$root/.$name.$$.partial
trap 'rm -f "$tmp"' EXIT HUP INT TERM
gzip -c "$src" > "$tmp"
sync -f "$tmp"
mv "$tmp" "$target"
sync -f "$root"
