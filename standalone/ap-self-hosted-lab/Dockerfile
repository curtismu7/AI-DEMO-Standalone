FROM node:26-alpine
WORKDIR /app
COPY package.json ./
COPY public ./public
COPY server.js ./
ENV BIND_HOST=0.0.0.0 PORT=5301
EXPOSE 5301
CMD ["node", "server.js"]
