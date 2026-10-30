#!/bin/sh
set -eu
if [ "${1:-}" = worker ]; then
  exec python manage.py worker
fi
python manage.py migrate --noinput
python manage.py bootstrap
exec gunicorn config.wsgi --bind 0.0.0.0:8000 --workers 2 --timeout 120 --access-logfile /dev/null
