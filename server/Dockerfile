# 할 일 체커 동기화 서버 — 의존성 없는 단일 파일이라 빌드 단계가 필요 없다.
FROM node:22-alpine

# su-exec: root로 볼륨 권한만 맞춘 뒤 node 유저로 내려가기 위해 사용
RUN apk add --no-cache su-exec

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=8787

WORKDIR /app
COPY package.json index.js ./
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data

EXPOSE 8787
VOLUME ["/data"]

# SYNC_TOKEN을 반드시 주입할 것 (미주입 시 컨테이너가 토큰을 새로 만들어 클라이언트와 어긋난다)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8787)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "index.js"]
