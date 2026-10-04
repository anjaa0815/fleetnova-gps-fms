FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server.js ./
COPY server ./server
# the server shares the Mongolian dictionary with the frontend
COPY src/i18n ./src/i18n
EXPOSE 3000
CMD ["node", "server.js"]
