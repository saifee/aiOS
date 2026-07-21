FROM node:20-alpine
WORKDIR /app
COPY package*.json turbo.json ./
COPY services/voice/package.json services/voice/
COPY packages/db/package.json packages/db/
COPY packages/integrations/package.json packages/integrations/
RUN npm install
COPY . .
RUN npm -w packages/db run generate && npm -w @leadhunter/voice run build
EXPOSE 5050
CMD ["node", "services/voice/dist/server.js"]
