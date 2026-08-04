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
 * 각 라우트가 컬렉션을 통째로 읽기 때문에 캐시가 없으면 요청 1건당
 * 문서 수만큼 read 가 발생한다(사전규격+발주계획 1,387건). 프론트에서
 * 두 컴포넌트가 각각 호출하면 페이지 1회 열 때 2,700 read 를 넘겨
 * Firestore 무료 한도(일 50,000 read)를 금방 소진한다. 실제로 소진시킨 적 있다.
 *
 * 데이터는 수집 배치가 하루 1회 갱신하므로 TTL 10분이면 충분히 신선하다.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
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

// API: 사전규격 + 발주계획 통합 조회
// 두 소스를 _source 로 구분해 한 배열로 반환한다. 617건 규모라 전량 조회 후
// 클라이언트에서 필터링한다 (Firestore 복합색인 불필요).
app.get('/api/firestore/pre-specs', async (req, res) => {
    if (!firestore) {
        return res.json([]);
    }

    try {
        const [specs, plans] = await Promise.all([
            readCollection('pre_spec_list', d => ({ ...d, _source: 'pre_spec' })),
            readCollection('order_plan_list', d => ({ ...d, _source: 'order_plan' }))
        ]);

        // 사전규격은 접수일시(rcptDt), 발주계획은 게시일시(nticeDt) 기준 최신순
        const rows = [...specs, ...plans].sort((a, b) =>
            String(b.rcptDt || b.nticeDt || '').localeCompare(String(a.rcptDt || a.nticeDt || '')));

        res.json(rows);
    } catch (error) {
        console.error('[Server] Error fetching pre-specs:', error.message);
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
