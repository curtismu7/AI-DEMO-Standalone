FROM node:26-alpine
WORKDIR /app
COPY package.json ./
COPY public ./public
COPY server.js ./
EXPOSE 5301
CMD ["node", "server.js"]
