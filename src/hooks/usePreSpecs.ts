import { useState, useEffect } from 'react';
import { db, ref, onValue } from '../api/firebase';
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
 * RTDB 를 클라이언트에서 직접 읽는다. 서버 라우트를 거치지 않는다.
 *
 * 전에는 Firestore 를 서버 경유로 읽었는데, 문서 읽기 건수 과금이라
 * 1,387건 컬렉션을 훑을 때마다 그만큼 read 가 나가 무료 한도를 소진시켰다.
 * RTDB 는 전송량 과금이고 전체가 2MB 수준이라 이 구조가 성립한다.
 * useBids 와 같은 방식이다.
 */
const SPEC_PATH = '/pre_specs';
const PLAN_PATH = '/order_plans';

const toRows = (node: any, source: 'pre_spec' | 'order_plan'): PreSpecItem[] =>
    Object.entries(node || {}).map(([id, v]: [string, any]) =>
        toItem({ ...v, id, _source: source }));

export const usePreSpecs = (domain?: PreSpecDomain) => {
    const [all, setAll] = useState<PreSpecItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let specs: PreSpecItem[] = [];
        let plans: PreSpecItem[] = [];
        let specLoaded = false;
        let planLoaded = false;

        const publish = () => {
            setAll([...specs, ...plans].sort((a, b) =>
                String(b.postedAt).localeCompare(String(a.postedAt))));
            if (specLoaded && planLoaded) setLoading(false);
        };

        const onErr = (err: Error) => {
            console.error('Error reading pre-specs from RTDB:', err);
            setError(err);
            setLoading(false);
        };

        const offSpec = onValue(ref(db, SPEC_PATH), snap => {
            specs = toRows(snap.val(), 'pre_spec');
            specLoaded = true;
            publish();
        }, onErr);

        const offPlan = onValue(ref(db, PLAN_PATH), snap => {
            plans = toRows(snap.val(), 'order_plan');
            planLoaded = true;
            publish();
        }, onErr);

        return () => { offSpec(); offPlan(); };
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
