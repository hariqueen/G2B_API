import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, FileText } from 'lucide-react';
import { usePreSpecs } from '../hooks/usePreSpecs';
import { PreSpecItem, PreSpecDomain } from '../types';
import {
    CARD, THEAD, TBODY, TR, TD, TD_FIRST, TH, TH_C, TH_R, TH_FIRST,
    badge, iconLink, FilterSelect, SearchBox, PageSizeSelect, Pagination
} from './ui/table';

type StatusFilter = 'all' | 'open' | 'waiting' | 'noticed';
type SourceFilter = 'all' | 'pre_spec' | 'order_plan';

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
    if (dday < 0) return { text: '마감', tone: 'slate' as const };
    if (dday === 0) return { text: 'D-DAY', tone: 'red' as const };
    if (dday <= 3) return { text: `D-${dday}`, tone: 'rose' as const };
    if (dday <= 7) return { text: `D-${dday}`, tone: 'amber' as const };
    return { text: `D-${dday}`, tone: 'slate' as const };
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
    /** 어느 도메인 목록인지. 탭마다 다르다. */
    domain: PreSpecDomain;
}

/**
 * 공고 상세 URL. 대시보드가 보유한 실제 URL을 우선 쓰고,
 * 없을 때만 번호로 조립한다(차수를 모르면 000 가정이라 부정확할 수 있다).
 */
const bidUrl = (no: string, ord: string, resolved: ResolvedBid | null) =>
    resolved?.url
    || `https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=${no}&bidPbancOrd=${ord || '000'}`;

const PreSpecFinder = ({ resolveBid, initialStatus = 'all', domain }: Props) => {
    const { items, loading, error } = usePreSpecs(domain);
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<StatusFilter>(initialStatus);
    const [source, setSource] = useState<SourceFilter>('all');
    const [swOnly, setSwOnly] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const scrollRef = useRef<HTMLDivElement>(null);

    // 필터가 바뀌면 건수가 줄어 현재 페이지가 범위를 벗어날 수 있다.
    useEffect(() => { setPage(1); }, [query, status, source, swOnly, pageSize]);

    const matchStatus = (i: PreSpecItem, s: StatusFilter) => {
        if (s === 'open') return i.dday !== null && i.dday >= 0;
        if (s === 'waiting') return !i.isNoticed;
        if (s === 'noticed') return i.isNoticed;
        return true;
    };
    const matchSource = (i: PreSpecItem, s: SourceFilter) => s === 'all' || i.source === s;

    // 검색어·SW 는 두 드롭다운 모두에 걸린다. 여기까지가 공통 모집단.
    const base = useMemo(() => items.filter(i => {
        if (query && !i.title.toLowerCase().includes(query.toLowerCase())
            && !i.institution.toLowerCase().includes(query.toLowerCase())) return false;
        if (swOnly && !i.isSwBiz) return false;
        return true;
    }), [items, query, swOnly]);

    const filtered = useMemo(() => base
        .filter(i => matchStatus(i, status) && matchSource(i, source))
        .sort((a, b) => {
            // '의견중'은 마감 임박 순으로 모아 본다. 그 외는 최신 접수순(서버 정렬) 유지.
            if (status !== 'open') return 0;
            return (a.dday ?? 99) - (b.dday ?? 99);
        }), [base, status, source]);

    // 각 드롭다운의 건수는 '다른' 필터를 적용한 뒤 센다 —
    // 그래야 그 항목을 골랐을 때 실제로 몇 건이 남는지가 그대로 보인다.
    const statusOpts = useMemo(() => {
        const pool = base.filter(i => matchSource(i, source));
        const n = (s: StatusFilter) => pool.filter(i => matchStatus(i, s)).length;
        return [
            { key: 'all' as const, label: '전체', n: n('all') },
            { key: 'open' as const, label: '의견중', n: n('open') },
            { key: 'waiting' as const, label: '공고 대기중', n: n('waiting') },
            { key: 'noticed' as const, label: '공고 전환됨', n: n('noticed') }
        ];
    }, [base, source]);

    const sourceOpts = useMemo(() => {
        const pool = base.filter(i => matchStatus(i, status));
        const n = (s: SourceFilter) => pool.filter(i => matchSource(i, s)).length;
        return [
            { key: 'all' as const, label: '전체', n: n('all') },
            { key: 'pre_spec' as const, label: '사전규격', n: n('pre_spec') },
            { key: 'order_plan' as const, label: '발주계획', n: n('order_plan') }
        ];
    }, [base, status]);

    // 필터로 건수가 줄어 현재 페이지가 범위를 벗어나면 빈 화면이 되므로
    // 마지막 페이지로 당겨서 쓴다.
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const curPage = Math.min(Math.max(1, page), totalPages);
    const startIdx = (curPage - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);

    // 페이지를 넘길 때마다 목록 머리로 올려준다 — 스크롤 위치가 남으면
    // 새 페이지 중간부터 보이게 된다.
    const goPage = (p: number) => {
        setPage(Math.min(Math.max(1, p), totalPages));
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

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

    return (
        <div ref={scrollRef} className="h-full overflow-y-auto p-8 bg-[#F8FAFC]">
            <div className={CARD}>
                {/* 헤더 — 공고 리스트와 동일한 구성 */}
                <div className="px-6 sm:px-7 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                    <div className="flex items-baseline gap-2.5">
                        <h3 className="font-bold text-[15px] text-slate-800 tracking-tight whitespace-nowrap">
                            사전규격 · 발주계획
                        </h3>
                        <span className="text-xs font-bold text-slate-400 tabular-nums whitespace-nowrap">
                            {filtered.length}건
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <FilterSelect label="상태" value={status} onChange={setStatus} options={statusOpts} />
                        <FilterSelect label="구분" value={source} onChange={setSource} options={sourceOpts} />

                        <label className="flex items-center gap-2 cursor-pointer select-none px-1">
                            <div className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${swOnly ? 'bg-blue-600' : 'bg-white ring-1 ring-slate-300'}`}>
                                {swOnly && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
                            </div>
                            <input type="checkbox" className="hidden" checked={swOnly}
                                onChange={(e) => setSwOnly(e.target.checked)} />
                            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">SW사업만</span>
                        </label>

                        <SearchBox value={query} onChange={setQuery} placeholder="품명, 기관명 검색..." />
                        <PageSizeSelect value={pageSize} onChange={setPageSize} />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className={THEAD}>
                            <tr>
                                <th className={`${TH_FIRST} text-center`}>구분</th>
                                <th className={TH}>품명 / 기관</th>
                                <th className={TH_R}>사업금액</th>
                                <th className={TH_C}>접수일</th>
                                <th className={TH_C}>의견마감 / 발주예정</th>
                                <th className={TH_C}>상태</th>
                                <th className={TH_C}>규격서</th>
                            </tr>
                        </thead>
                        <tbody className={TBODY}>
                            {pageItems.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center text-sm font-bold text-slate-400 py-20">
                                        조건에 맞는 항목이 없습니다.
                                    </td>
                                </tr>
                            ) : pageItems.map(item => (
                                <Row
                                    key={`${item.source}-${item.id}`}
                                    item={item}
                                    resolveBid={resolveBid}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>

                {filtered.length > 0 && (
                    <Pagination
                        total={filtered.length}
                        page={curPage}
                        pageSize={pageSize}
                        totalPages={totalPages}
                        onPage={goPage}
                    />
                )}
            </div>
        </div>
    );
};

const Row = ({ item, resolveBid }: {
    item: PreSpecItem;
    resolveBid?: (n: string) => ResolvedBid | null;
}) => {
    const dd = ddayBadge(item.dday);
    const isPlan = item.source === 'order_plan';

    // 참조하는 공고를 전부 개별 링크로 노출한다.
    // 건수만 표시하고 첫 건만 열면 나머지가 보이지 않는다.
    const refs = (item.bidRefs.length ? item.bidRefs : item.bidNtceNos.map(no => ({ no, ord: '' })))
        .map(r => {
            const resolved = resolveBid?.(r.no) ?? null;
            return { ...r, resolved, url: bidUrl(r.no, r.ord, resolved) };
        });
    const primary = refs[0];

    // 기관·수요기관·담당자를 한 줄로 접는다. 표에서는 행 높이를 일정하게 두는 게 낫다.
    const subline = [
        item.institution,
        item.demandInstitution && item.demandInstitution !== item.institution ? `수요 ${item.demandInstitution}` : '',
        [item.department, item.officer, item.officerTel].filter(Boolean).join(' ')
    ].filter(Boolean).join(' · ');

    return (
        <tr id={`prespec-${item.id}`} className={TR}>
            <td className={`${TD_FIRST} text-center`}>
                <span className={badge(isPlan ? 'violet' : 'blue')}>
                    {isPlan ? '발주계획' : '사전규격'}
                </span>
            </td>

            <td className={`${TD} max-w-[420px]`}>
                <div className="flex items-center gap-1.5 min-w-0">
                    {primary ? (
                        <a
                            href={primary.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`${item.title}\n→ ${primary.resolved?.title || primary.no}`}
                            className="font-bold text-sm text-slate-700 line-clamp-1 hover:text-blue-600 hover:underline decoration-blue-300 underline-offset-2 transition-colors"
                        >
                            {item.title}
                        </a>
                    ) : (
                        // 아직 공고가 안 났다 — 눌러도 갈 곳이 없다는 게 보이게 흐리게 둔다
                        <p title={`${item.title}\n(연결된 입찰공고 없음)`}
                            className="font-bold text-sm text-slate-400 line-clamp-1">{item.title}</p>
                    )}

                    {/*
                      공고가 여러 건 걸린 경우(전체의 17%) 제목은 첫 건으로만 간다.
                      나머지를 여기 번호로 남긴다 — 건수만 세고 열 수는 없던 게
                      원래 문제였으므로 전부 개별 링크로 둔다.
                    */}
                    {refs.slice(1).map((r, idx) => (
                        <a
                            key={`more-${r.no}`}
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            title={`연결된 다른 공고: ${r.resolved?.title || r.no}`}
                            className="shrink-0 px-1.5 rounded text-[10px] font-bold leading-5 bg-blue-50 text-blue-500 ring-1 ring-blue-600/10 hover:bg-blue-600 hover:text-white transition-all"
                        >
                            {idx + 2}
                        </a>
                    ))}
                </div>
                <p title={subline} className="text-xs text-slate-400 mt-0.5 line-clamp-1">{subline}</p>
            </td>

            <td className={`${TD} text-right font-bold text-sm text-slate-600 tabular-nums whitespace-nowrap`}>
                {formatMoney(item.amount)}
            </td>

            <td className={`${TD} text-center text-sm text-slate-400 tabular-nums whitespace-nowrap`}>
                {item.postedAt ? item.postedAt.slice(0, 10) : '-'}
            </td>

            <td className={`${TD} text-center whitespace-nowrap`}>
                {dd ? (
                    <div className="inline-flex items-center gap-1.5">
                        <span className="text-sm text-slate-500 tabular-nums">
                            {item.deadlineAt ? item.deadlineAt.slice(5, 10) : ''}
                        </span>
                        <span className={badge(dd.tone)}>{dd.text}</span>
                    </div>
                ) : item.orderYm ? (
                    <span className="text-sm font-bold text-violet-500 tabular-nums">{item.orderYm}</span>
                ) : (
                    <span className="text-sm text-slate-300">-</span>
                )}
            </td>

            <td className={`${TD} text-center whitespace-nowrap`}>
                <div className="inline-flex items-center gap-1">
                    {item.isSwBiz && <span className={badge('emerald')}>SW</span>}
                    <span className={badge(item.isNoticed ? 'slate' : 'amber')}>
                        {item.isNoticed ? '공고 전환' : '공고 대기'}
                    </span>
                </div>
            </td>

            <td className={`${TD} text-center whitespace-nowrap`}>
                {item.specDocUrls.length === 0 ? (
                    <span className="text-sm text-slate-300">-</span>
                ) : (
                    <div className="inline-flex items-center gap-1">
                        {item.specDocUrls.slice(0, 3).map((url, idx) => (
                            <a key={`doc-${idx}`} href={url} target="_blank" rel="noreferrer"
                                title={`규격서 ${idx + 1} 내려받기`} className={iconLink('slate')}>
                                <FileText size={12} />
                            </a>
                        ))}
                    </div>
                )}
            </td>
        </tr>
    );
};

export default PreSpecFinder;
