import { useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, FileText, Phone, Search } from 'lucide-react';
import { usePreSpecs } from '../hooks/usePreSpecs';
import { PreSpecItem } from '../types';

type StatusFilter = 'all' | 'open' | 'waiting' | 'noticed';

const formatMoney = (amount: number) => {
    if (!amount || isNaN(amount)) return '-';
    if (amount >= 100000000) {
        const eok = amount / 100000000;
        if (eok >= 10) return `${Math.round(eok).toLocaleString()}억원`;
        const r = Math.round(eok * 10) / 10;
        return r % 1 === 0 ? `${r}억원` : `${r.toFixed(1)}억원`;
    }
    if (amount >= 10000) return `${Math.round(amount / 10000).toLocaleString()}만원`;
    return `${Math.round(amount).toLocaleString()}원`;
};

const ddayBadge = (dday: number | null) => {
    if (dday === null) return null;
    if (dday < 0) return { text: '마감', cls: 'bg-slate-100 text-slate-400' };
    if (dday === 0) return { text: 'D-DAY', cls: 'bg-red-600 text-white' };
    if (dday <= 3) return { text: `D-${dday}`, cls: 'bg-red-100 text-red-700' };
    if (dday <= 7) return { text: `D-${dday}`, cls: 'bg-amber-100 text-amber-700' };
    return { text: `D-${dday}`, cls: 'bg-slate-100 text-slate-500' };
};

/** 대시보드가 보유한 공고 정보. 없으면 null. */
export interface ResolvedBid {
    url: string;
    title: string;
}

interface Props {
    /** 공고번호로 대시보드의 공고를 찾는다. 실제 공고URL(차수 포함)을 얻기 위함. */
    resolveBid?: (bidNtceNo: string) => ResolvedBid | null;
    /** 진입 시 선택할 필터. 대시보드 카드에서 들어오면 '의견중'으로 연다. */
    initialStatus?: StatusFilter;
}

/**
 * 공고 상세 URL. 대시보드가 보유한 실제 URL을 우선 쓰고,
 * 없을 때만 번호로 조립한다(차수를 모르면 000 가정이라 부정확할 수 있다).
 */
const bidUrl = (no: string, ord: string, resolved: ResolvedBid | null) =>
    resolved?.url
    || `https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=${no}&bidPbancOrd=${ord || '000'}`;

const PreSpecFinder = ({ resolveBid, initialStatus = 'all' }: Props) => {
    const { items, loading, error } = usePreSpecs();
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<StatusFilter>(initialStatus);
    const [swOnly, setSwOnly] = useState(false);

    const filtered = useMemo(() => {
        return items.filter(i => {
            if (query && !i.title.toLowerCase().includes(query.toLowerCase())
                && !i.institution.toLowerCase().includes(query.toLowerCase())) return false;
            if (swOnly && !i.isSwBiz) return false;

            if (status === 'open') return i.dday !== null && i.dday >= 0;
            if (status === 'waiting') return !i.isNoticed;
            if (status === 'noticed') return i.isNoticed;
            return true;
        }).sort((a, b) => {
            // '의견중'은 마감 임박 순으로 모아 본다. 그 외는 최신 접수순(서버 정렬) 유지.
            if (status !== 'open') return 0;
            return (a.dday ?? 99) - (b.dday ?? 99);
        });
    }, [items, query, status, swOnly]);

    const counts = useMemo(() => ({
        all: items.length,
        open: items.filter(i => i.dday !== null && i.dday >= 0).length,
        waiting: items.filter(i => !i.isNoticed).length,
        noticed: items.filter(i => i.isNoticed).length
    }), [items]);

    if (loading) {
        return <div className="flex items-center justify-center h-full text-sm font-bold text-slate-400">
            사전규격 불러오는 중...
        </div>;
    }

    if (error) {
        return <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500">
            <AlertCircle size={28} className="text-red-400" />
            <p className="text-sm font-bold">사전규격을 불러오지 못했습니다.</p>
            <p className="text-xs">{error.message}</p>
        </div>;
    }

    const tabs: { key: StatusFilter; label: string; n: number }[] = [
        { key: 'all', label: '전체', n: counts.all },
        { key: 'open', label: '의견중', n: counts.open },
        { key: 'waiting', label: '공고 대기중', n: counts.waiting },
        { key: 'noticed', label: '공고 전환됨', n: counts.noticed }
    ];

    return (
        <div className="flex flex-col h-full bg-[#F8FAFC]">
            {/* 필터 바 */}
            <div className="bg-white border-b border-slate-200 px-8 py-5 flex flex-col gap-4 shadow-sm z-10">
                <div className="flex flex-wrap items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 w-64 shadow-sm">
                        <Search size={14} className="text-slate-400" />
                        <input
                            type="text"
                            placeholder="품명 · 기관 검색..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="w-full bg-transparent text-xs font-bold text-slate-600 outline-none"
                        />
                    </div>

                    <div className="flex items-center gap-1">
                        {tabs.map(t => (
                            <button
                                key={t.key}
                                onClick={() => setStatus(t.key)}
                                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${status === t.key
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-white text-slate-500 border border-slate-200 hover:text-slate-700'}`}
                            >
                                {t.label} <span className="opacity-70">{t.n}</span>
                            </button>
                        ))}
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none ml-auto">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${swOnly ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>
                            {swOnly && <div className="w-2 h-2 bg-white rounded-sm" />}
                        </div>
                        <input type="checkbox" className="hidden" checked={swOnly}
                            onChange={(e) => setSwOnly(e.target.checked)} />
                        <span className="text-xs font-bold text-slate-600">SW사업만</span>
                    </label>
                </div>
            </div>

            {/* 목록 */}
            <div className="flex-1 overflow-auto px-8 py-6">
                {filtered.length === 0 ? (
                    <div className="text-center text-sm font-bold text-slate-400 py-20">
                        조건에 맞는 항목이 없습니다.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(item => (
                            <Row
                                key={`${item.source}-${item.id}`}
                                item={item}
                                resolveBid={resolveBid}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const Row = ({ item, resolveBid }: {
    item: PreSpecItem;
    resolveBid?: (n: string) => ResolvedBid | null;
}) => {
    const badge = ddayBadge(item.dday);
    const isPlan = item.source === 'order_plan';

    // 참조하는 공고를 전부 개별 링크로 노출한다.
    // 이전에는 건수만 표시하고 첫 건만 열어 나머지가 보이지 않았다.
    const refs = (item.bidRefs.length ? item.bidRefs : item.bidNtceNos.map(no => ({ no, ord: '' })))
        .map(r => {
            const resolved = resolveBid?.(r.no) ?? null;
            return { ...r, resolved, url: bidUrl(r.no, r.ord, resolved) };
        });
    const primary = refs[0];

    return (
        <div
            id={`prespec-${item.id}`}
            className="bg-white rounded-2xl border border-slate-100 p-5 transition-all hover:border-blue-200 hover:shadow-sm"
        >
            <div className="flex items-start gap-3">
                <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold ${isPlan
                    ? 'bg-violet-50 text-violet-600'
                    : 'bg-blue-50 text-blue-600'}`}>
                    {isPlan ? '발주계획' : '사전규격'}
                </span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* 공고 리스트와 동일하게 제목 클릭 시 나라장터 공고 상세로 이동 */}
                        {primary ? (
                            <a
                                href={primary.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-bold text-slate-800 hover:text-blue-600 hover:underline transition-colors"
                            >
                                {item.title}
                            </a>
                        ) : (
                            <h4 className="text-sm font-bold text-slate-800">{item.title}</h4>
                        )}
                        {badge && (
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${badge.cls}`}>
                                {badge.text}
                            </span>
                        )}
                        {item.isSwBiz && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-600">
                                SW사업
                            </span>
                        )}
                        {!item.isNoticed && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-50 text-amber-600">
                                공고 대기중
                            </span>
                        )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-slate-500">
                        <span>{item.institution}</span>
                        {item.demandInstitution && item.demandInstitution !== item.institution && (
                            <span className="text-slate-400">수요 {item.demandInstitution}</span>
                        )}
                        <span className="text-slate-700">{formatMoney(item.amount)}</span>
                        {item.postedAt && <span className="text-slate-400">{item.postedAt.slice(0, 10)}</span>}
                        {item.orderYm && <span className="text-violet-500">발주예정 {item.orderYm}</span>}
                    </div>

                    {(item.officer || item.department) && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                            <Phone size={11} />
                            <span>
                                {[item.department, item.officer, item.officerTel].filter(Boolean).join(' · ')}
                            </span>
                        </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        {item.specDocUrls.slice(0, 3).map((url, idx) => (
                            <a key={idx} href={url} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-50 text-slate-600 hover:bg-slate-100">
                                <FileText size={11} /> 규격서 {idx + 1}
                            </a>
                        ))}
                        {refs.map((r, idx) => (
                            <a
                                key={r.no}
                                href={r.url}
                                target="_blank"
                                rel="noreferrer"
                                title={r.resolved?.title || r.no}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 max-w-[280px]"
                            >
                                <ExternalLink size={11} className="shrink-0" />
                                <span className="truncate">
                                    공고{refs.length > 1 ? ` ${idx + 1}` : ''} · {r.resolved?.title || r.no}
                                </span>
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PreSpecFinder;
