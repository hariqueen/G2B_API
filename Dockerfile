# ---------- build stage ----------
FROM node:20-slim AS build

WORKDIR /app

COPY package.json .
RUN npm install

# VITE_ 변수는 빌드 시점에 번들로 구워진다 (런타임 주입 불가)
ARG VITE_RTDB_DATABASE_URL
ENV VITE_RTDB_DATABASE_URL=$VITE_RTDB_DATABASE_URL

COPY . .
RUN npm run build

# ---------- runtime stage ----------
FROM node:20-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json .
RUN npm install --omit=dev && npm cache clean --force

COPY server ./server
COPY --from=build /app/dist ./dist

EXPOSE 3001

CMD ["node", "server/index.js"]
