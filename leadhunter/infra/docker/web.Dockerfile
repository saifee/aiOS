FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json turbo.json ./
COPY apps/web/package.json apps/web/
RUN npm install
COPY . .
RUN npm -w apps/web run build
FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
