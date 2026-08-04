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

/**
 * 컬렉션 전체 조회 결과를 메모리에 캐시한다.
 *
 * 라우트가 컬렉션을 통째로 읽기 때문에 캐시가 없으면 요청 1건당 문서 수만큼
 * read 가 발생해 Firestore 무료 한도(일 50,000 read)를 소진시킨다. 실제로 겪었다.
 *
 * 사전규격/발주계획은 이 문제로 RTDB 로 옮겨 클라이언트가 직접 읽는다.
 * 여기 남은 것은 AX 입찰공고(bid_pblanc_list)뿐이다.
 *
 * 데이터는 수집 배치(GitHub Actions)가 하루 1회 갱신하므로 TTL 을 길게 잡는다.
 *
 * TTL 별 하루 최대 read (문서 1,674건 기준, 무료 한도 50,000):
 *   10분 → 241,056  한도 5배 초과
 *   60분 →  40,176  빠듯함
 *    6시간 →  6,696  여유
 * 수집이 하루 1회라 6시간이면 신선도도 충분하다.
 * 즉시 반영이 필요하면 POST /api/cache/clear 로 비운다.
 */
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MINUTES || 360) * 60 * 1000;
const cache = new Map();   // name -> { at, rows }
const inflight = new Map(); // name -> Promise (동시 요청 중복 읽기 방지)

// 조회 실패 후 재시도까지 기다리는 시간.
// 할당량 초과 상태에서 매 요청마다 재시도하면 복구를 더 늦춘다.
const ERROR_BACKOFF_MS = 60 * 1000;
const lastError = new Map(); // name -> { at, message }

async function readCollection(name, decorate = (d) => d) {
    const hit = cache.get(name);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
    if (inflight.has(name)) return inflight.get(name);

    // 최근에 실패했으면 잠시 재시도하지 않는다. 캐시가 있으면 낡았어도 그걸 준다.
    const err = lastError.get(name);
    if (err && Date.now() - err.at < ERROR_BACKOFF_MS) {
        if (hit) return hit.rows;
        throw new Error(err.message);
    }

    const task = (async () => {
        const snap = await firestore.collection(name).get();
        const rows = [];
        snap.forEach(doc => rows.push(decorate({ id: doc.id, ...doc.data() })));
        cache.set(name, { at: Date.now(), rows });
        lastError.delete(name);
        console.log(`[Server] ${name}: ${rows.length}건 조회 후 캐시 (TTL ${CACHE_TTL_MS / 60000}분)`);
        return rows;
    })().catch(e => {
        lastError.set(name, { at: Date.now(), message: e.message });
        // 낡은 캐시라도 있으면 화면을 죽이지 않는다 (할당량 초과 등 일시 장애 대비)
        if (hit) {
            console.warn(`[Server] ${name} 조회 실패, 캐시로 응답: ${e.message}`);
            return hit.rows;
        }
        throw e;
    }).finally(() => inflight.delete(name));

    inflight.set(name, task);
    return task;
}

// 캐시 상태 확인 / 강제 갱신
app.get('/api/cache', (req, res) => {
    const now = Date.now();
    res.json({
        ttlMinutes: CACHE_TTL_MS / 60000,
        entries: [...cache.entries()].map(([name, v]) => ({
            name, rows: v.rows.length, ageSeconds: Math.round((now - v.at) / 1000)
        }))
    });
});
app.post('/api/cache/clear', (req, res) => {
    cache.clear();
    res.json({ cleared: true });
});

// API: Firestore bid_pblanc_list 전체 조회
app.get('/api/firestore/bids', async (req, res) => {
    if (!firestore) {
        return res.json([]);
    }

    try {
        const bids = await readCollection('bid_pblanc_list');
        // 정렬은 캐시된 배열에서 처리한다 (Firestore orderBy 를 매번 태우지 않는다)
        const sorted = [...bids].sort((a, b) =>
            String(b.bidNtceDt || '').localeCompare(String(a.bidNtceDt || '')));
        res.json(sorted);
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
