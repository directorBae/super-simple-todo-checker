#!/bin/sh
# 마운트된 볼륨(도커 named volume은 이미지 권한을 복사하지만 fly.io 볼륨은 root 소유)의
# 소유권을 node 유저로 맞춘 뒤 권한을 낮춰 앱을 띄운다.
set -e

if [ "$(id -u)" = "0" ]; then
  mkdir -p "${DATA_DIR:-/data}"
  chown -R node:node "${DATA_DIR:-/data}"
  exec su-exec node "$@"
fi

exec "$@"
