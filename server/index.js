import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// Health check
// 데이터는 전부 Realtime Database 에 있고 클라이언트가 직접 읽는다.
// 이 서버는 정적 파일 서빙만 담당한다.
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// 프로덕션: Vite 빌드 결과물(dist)을 정적 서빙 + SPA 폴백
// 개발 시에는 vite dev 서버가 프론트를 담당하므로 dist가 없어도 무방
const distPath = path.resolve(__dirname, '..', 'dist');
if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log(`[Server] Serving static build from ${distPath}`);
} else {
    console.log('[Server] No dist/ found - API only mode');
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Listening on port ${PORT}`);
});
