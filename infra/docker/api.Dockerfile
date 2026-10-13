FROM node:20-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/integrations/package.json packages/integrations/
COPY packages/agents/package.json packages/agents/
RUN npm install
COPY . .
# same-origin UI: API URL is empty so the browser calls the same host it loaded from
ENV NEXT_PUBLIC_API_URL=""
RUN npm -w packages/db run generate && npm -w apps/web run build && npm -w apps/api run build
ENV NODE_ENV=production PORT=4000 FRONTEND_DIR=/app/apps/web/out
EXPOSE 4000
CMD ["sh", "-c", "npm -w packages/db run migrate && node apps/api/dist/server.js"]
