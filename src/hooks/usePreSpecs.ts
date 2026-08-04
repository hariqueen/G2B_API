import { useState, useEffect } from 'react';
import { PreSpecItem, PreSpecDomain } from '../types';

/** 배너에 "마감 임박"으로 띄울 기준(일). 메일 알림은 별도로 D-3을 쓴다. */
export const IMMINENT_DAYS = 7;

const num = (v: any) => {
    const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10);
    return isNaN(n) ? 0 : n;
};

// 'YYYY-MM-DD HH:MM:SS' → Date. 사파리 대응으로 공백을 T로 치환한다.
const parseDt = (raw: string) => {
    if (!raw) return null;
    const d = new Date(raw.trim().replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
};

const daysUntil = (raw: string) => {
    const d = parseDt(raw);
    if (!d) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
};

/**
 * bidNtceNoList 를 {공고번호, 차수} 로 분해한다.
 * 발주계획은 16자(번호13 + 차수3)로 오고, 사전규격은 13자로 차수가 없다.
 * 차수는 공고 URL(bidPbancOrd)에 필요하며 실측상 8%가 000이 아니다.
 */
const parseRefs = (raw: string) => {
    const out: { no: string; ord: string }[] = [];
    String(raw || '').split(',').forEach(part => {
        const t = part.trim();
        if (!t) return;
        const ref = (t.length === 16 && /^\d{3}$/.test(t.slice(-3)))
            ? { no: t.slice(0, -3), ord: t.slice(-3) }
            : { no: t.split('-')[0], ord: '' };
        if (ref.no && !out.some(x => x.no === ref.no)) out.push(ref);
    });
    return out;
};

const toItem = (doc: any): PreSpecItem => {
    const isPlan = doc._source === 'order_plan';
    const deadlineAt = doc.opninRgstClseDt || '';

    return {
        id: doc.id,
        source: isPlan ? 'order_plan' : 'pre_spec',
        title: (isPlan ? doc.bizNm : doc.prdctClsfcNoNm) || '제목 없음',
        institution: doc.orderInsttNm || '기관명 없음',
        demandInstitution: doc.rlDminsttNm || '',
        amount: num(isPlan ? doc.sumOrderAmt : doc.asignBdgtAmt),
        postedAt: (isPlan ? doc.nticeDt : doc.rcptDt) || '',
        deadlineAt,
        dday: deadlineAt ? daysUntil(deadlineAt) : null,
        isSwBiz: doc.swBizObjYn === 'Y',
        officer: doc.ofclNm || '',
        officerTel: doc.ofclTelNo || doc.telNo || '',
        department: doc.deptNm || '',
        orderYm: isPlan && doc.orderYear
            ? `${doc.orderYear}-${String(doc.orderMnth ?? '').padStart(2, '0')}`
            : '',
        // 발주계획은 ntceNticeYn 을 제공하고, 사전규격은 공고번호 유무로 판단한다
        isNoticed: isPlan
            ? doc.ntceNticeYn === 'Y'
            : (doc.bidNtceNos?.length ?? 0) > 0,
        bidNtceNos: doc.bidNtceNos || [],
        bidRefs: parseRefs(doc.bidNtceNoList),
        specDocUrls: doc.specDocUrls || [],
        keywords: doc._keywords || [],
        domains: doc._domains || [],
        raw: doc
    };
};

/**
 * 응답을 모듈 레벨에서 공유한다.
 *
 * 이 훅을 App(지표 카드)과 PreSpecFinder(목록)가 각각 호출하기 때문에
 * 캐시가 없으면 페이지 1회 열 때 같은 엔드포인트를 2번 때린다.
 * 서버가 컬렉션 전체를 읽는 구조라 그대로 Firestore read 로 이어진다.
 */
let sharedPromise: Promise<PreSpecItem[]> | null = null;

const loadPreSpecs = () => {
    if (!sharedPromise) {
        sharedPromise = fetch('/api/firestore/pre-specs')
            .then(res => {
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                return res.json();
            })
            .then((data: any[]) => data.map(toItem))
            .catch(err => {
                sharedPromise = null;   // 실패는 캐시하지 않는다
                throw err;
            });
    }
    return sharedPromise;
};

export const usePreSpecs = (domain?: PreSpecDomain) => {
    const [all, setAll] = useState<PreSpecItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let alive = true;
        loadPreSpecs()
            .then(rows => { if (alive) setAll(rows); })
            .catch(err => {
                console.error('Error fetching pre-specs:', err);
                if (alive) setError(err as Error);
            })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    // 도메인이 지정되면 해당 도메인 건만 본다.
    // 콜센터/AX 양쪽에 걸치는 건이 있어 포함 여부로 판정한다.
    const items = domain ? all.filter(i => i.domains.includes(domain)) : all;

    // 의견등록이 아직 열려 있는 건 (마감일 >= 오늘)
    const openOpinions = items
        .filter(i => i.source === 'pre_spec' && i.dday !== null && i.dday >= 0)
        .sort((a, b) => (a.dday ?? 0) - (b.dday ?? 0));

    // 마감 임박 = 열려 있는 것 중 IMMINENT_DAYS 이내.
    // 메일 알림은 D-3(매일 오는 푸시라 더 좁게), 배너는 D-7로 둔다.
    // 의견 창이 중앙값 5일이라 D-3만 보면 초반 절반을 놓친다.
    const imminentOpinions = openOpinions.filter(i => (i.dday ?? 99) <= IMMINENT_DAYS);

    return { items, openOpinions, imminentOpinions, loading, error };
};
