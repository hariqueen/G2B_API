import { useState, useEffect } from 'react';
import { PreSpecItem } from '../types';

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
        raw: doc
    };
};

export const usePreSpecs = () => {
    const [items, setItems] = useState<PreSpecItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const run = async () => {
            try {
                const res = await fetch('/api/firestore/pre-specs');
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                const data = await res.json();
                setItems(data.map(toItem));
            } catch (err) {
                console.error('Error fetching pre-specs:', err);
                setError(err as Error);
            } finally {
                setLoading(false);
            }
        };
        run();
    }, []);

    // 의견등록 진행중 = 마감일이 오늘 이후인 사전규격
    const openOpinions = items
        .filter(i => i.source === 'pre_spec' && i.dday !== null && i.dday >= 0)
        .sort((a, b) => (a.dday ?? 0) - (b.dday ?? 0));

    return { items, openOpinions, loading, error };
};
