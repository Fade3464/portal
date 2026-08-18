#!/bin/sh
set -eu

python manage.py migrate --noinput
python manage.py bootstrap_superuser
python manage.py collectstatic --noinput --clear
python manage.py check --deploy
