#!/bin/sh
set -eu
mkdir -p /recordings /app/storage/screenshots
Xvfb :99 -screen 0 1280x800x24 -nolisten tcp &
export DISPLAY=:99
pulseaudio --start --exit-idle-time=-1
pactl load-module module-null-sink sink_name=kura >/dev/null
pactl set-default-sink kura
exec node --import tsx src/main.ts
