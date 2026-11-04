FROM node:26-alpine
WORKDIR /app
COPY server/ ./server/
COPY documents/ ./documents/
ENV PORT=5252 ALLOWED_HOSTS=127.0.0.1,localhost,local.ping-devops.com,cimd-doc-server
EXPOSE 5252
USER node
CMD ["node", "server/index.js"]
