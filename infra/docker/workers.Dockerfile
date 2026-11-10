FROM node:26-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json turbo.json ./
COPY apps/workers/package.json apps/workers/
COPY packages/db/package.json packages/db/
COPY packages/integrations/package.json packages/integrations/
COPY packages/agents/package.json packages/agents/
RUN npm install
COPY . .
RUN npm -w packages/db run generate && npm -w apps/workers run build
CMD ["node", "apps/workers/dist/index.js"]
