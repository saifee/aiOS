FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/integrations/package.json packages/integrations/
RUN npm install
COPY . .
RUN npm -w packages/db run generate && npm -w apps/api run build
EXPOSE 4000
CMD ["sh", "-c", "npm -w packages/db run migrate && node apps/api/dist/server.js"]
