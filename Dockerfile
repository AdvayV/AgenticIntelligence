FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=optional --omit=dev
COPY src ./src
COPY public ./public
COPY demo ./demo
ENV PORT=3000
EXPOSE 3000
# Bind externally only inside the container via HOST.
ENV HOST=0.0.0.0
CMD ["node", "src/server.js"]
