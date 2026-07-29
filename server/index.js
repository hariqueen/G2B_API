import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Firestore } from '@google-cloud/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// Firestore (g2b-bid-finder) - @google-cloud/firestore 직접 사용
// firebase-admin의 cert() PEM 파서가 엄격하므로 우회
const firestoreKeyPath = process.env.FIRESTORE_KEY_PATH || './server/keys/firestore-key.json';

let firestore;
try {
    firestore = new Firestore({
        projectId: 'g2b-bid-finder',
        keyFilename: firestoreKeyPath
    });
    console.log('[Server] Firestore (g2b-bid-finder) initialized');
} catch (err) {
    console.error('[Server] Failed to initialize Firestore:', err.message);
    console.error('[Server] BidFinder API will return empty results.');
}

// API: Firestore bid_pblanc_list 전체 조회
app.get('/api/firestore/bids', async (req, res) => {
    if (!firestore) {
        return res.json([]);
    }

    try {
        const snapshot = await firestore.collection('bid_pblanc_list')
            .orderBy('bidNtceDt', 'desc')
            .get();

        const bids = [];
        snapshot.forEach(doc => {
            bids.push({ id: doc.id, ...doc.data() });
        });

        console.log(`[Server] Fetched ${bids.length} bids from Firestore`);
        res.json(bids);
    } catch (error) {
        console.error('[Server] Error fetching Firestore bids:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', firestore: !!firestore });
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
