FROM node:20-slim

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

# Vite: 3003, API server: 3001
EXPOSE 3003

# 백엔드 API 서버 + Vite 동시 실행
CMD ["sh", "-c", "node server/index.js & npx vite --host 0.0.0.0 --port 3003"]
