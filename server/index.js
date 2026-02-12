import express from 'express';
import { Firestore } from '@google-cloud/firestore';

const app = express();
const PORT = 3001;

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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] API server running on port ${PORT}`);
});
