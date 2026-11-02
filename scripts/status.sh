#!/bin/sh
# Shows whether Sutra is healthy on this machine. Changes nothing.
echo "== Services"
launchctl list | grep com.sutra || echo "No Sutra services are loaded."
echo
echo "== App on 127.0.0.1:3100"
for path in / /login /api/v1/public-key; do
  printf '%s  ' "$path"
  curl -s -o /dev/null -w '%{http_code} in %{time_total}s\n' --max-time 15 "http://127.0.0.1:3100$path" || echo "no answer"
done
echo
echo "== Public address"
curl -s -o /dev/null -w 'https://sutra.teentechindia.com  %{http_code} in %{time_total}s\n' --max-time 20 https://sutra.teentechindia.com/login || echo "no answer"
echo
echo "== Last app log lines"
tail -n 10 "$HOME/sutra/logs/app.log" 2>/dev/null
