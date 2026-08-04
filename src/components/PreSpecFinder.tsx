import { useMemo, useState } from 'react';
import { AlertCircle, Clock, ExternalLink, FileText, Phone, Search } from 'lucide-react';
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

interface Props {
    /** 관련 입찰공고로 이동. 공고번호를 넘긴다. */
    onOpenBid?: (bidNtceNo: string) => void;
}

const PreSpecFinder = ({ onOpenBid }: Props) => {
    const { items, openOpinions, loading, error } = usePreSpecs();
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<StatusFilter>('all');
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
            {/* 의견등록 마감 임박 - 상시 3~4건 수준이라 상단 고정 배너로 둔다 */}
            {openOpinions.length > 0 && (
                <div className="bg-white border-b border-slate-200 px-8 pt-5">
                    <div className="rounded-2xl border border-red-100 bg-red-50/60 p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Clock size={15} className="text-red-600" />
                            <span className="text-xs font-bold text-red-700">의견등록 진행중</span>
                            <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                                {openOpinions.length}건
                            </span>
                        </div>
                        <div className="space-y-2">
                            {openOpinions.slice(0, 5).map(i => {
                                const b = ddayBadge(i.dday)!;
                                return (
                                    <div key={i.id} className="flex items-center gap-3 text-xs">
                                        <span className={`px-2 py-0.5 rounded-lg font-bold shrink-0 ${b.cls}`}>{b.text}</span>
                                        <span className="font-bold text-slate-700 truncate">{i.title}</span>
                                        <span className="text-slate-400 shrink-0 ml-auto">{formatMoney(i.amount)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

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
                            <Row key={`${item.source}-${item.id}`} item={item} onOpenBid={onOpenBid} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const Row = ({ item, onOpenBid }: { item: PreSpecItem; onOpenBid?: (n: string) => void }) => {
    const badge = ddayBadge(item.dday);
    const isPlan = item.source === 'order_plan';

    return (
        <div className="bg-white rounded-2xl border border-slate-100 p-5 hover:border-blue-200 hover:shadow-sm transition-all">
            <div className="flex items-start gap-3">
                <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold ${isPlan
                    ? 'bg-violet-50 text-violet-600'
                    : 'bg-blue-50 text-blue-600'}`}>
                    {isPlan ? '발주계획' : '사전규격'}
                </span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-800">{item.title}</h4>
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
                        {item.bidNtceNos.length > 0 && (
                            <button
                                onClick={() => onOpenBid?.(item.bidNtceNos[0])}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-600 hover:bg-blue-100"
                            >
                                <ExternalLink size={11} /> 연결된 입찰공고 {item.bidNtceNos.length}건
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PreSpecFinder;
