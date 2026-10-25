#!/usr/bin/env bash
# exit on error
set -o errexit

bundle exec rails db:prepare
bundle exec rails db:seed
exec bundle exec puma -C config/puma.rb
