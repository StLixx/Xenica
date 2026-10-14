#!/bin/sh
set -eu
exec systemd-run --scope --quiet --slice=pgops-development.slice "$@"
