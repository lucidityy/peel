FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --omit=dev

COPY . .
EXPOSE 3000

ENV PORT=3000
CMD ["node", "server.js"]
