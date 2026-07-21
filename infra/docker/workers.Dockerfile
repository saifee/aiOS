FROM node:20-alpine
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
