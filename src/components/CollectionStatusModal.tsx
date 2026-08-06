import { useState, useEffect } from 'react';
import { X, Calendar, TrendingUp, AlertTriangle, FileText, ClipboardList, Clock, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, ref, onValue } from '../api/firebase';
import { usePreSpecs } from '../hooks/usePreSpecs';
import { badge, iconLink } from './ui/table';

interface BidDetail {
    공고명: string;
    채권자명: string;
}

interface ImminentOpinion {
    title: string;
    institution: string;
    deadline: string;
    dday: number;
    amountEok: number;
    docUrl: string;
}

interface CollectionResult {
    total_count: number;
    collection_date: string;
    keyword_results: Record<string, number>;
    /** RTDB /search_keywords 에서 로드한 콜센터 도메인 키워드. 도메인 판별 기준이 된다. */
    keywords?: string[];
    keyword_bid_details?: Record<string, BidDetail[]>;
    bid_details: BidDetail[];
    ax_result?: {
        upserted_records: number;
        total_collected: number;
        filtered_records?: number;
    };
    ax_bid_details?: BidDetail[];
    prespec_result?: {
        pre_spec_count: number;
        order_plan_count: number;
    };
    imminent_opinions?: ImminentOpinion[];
}

interface CollectionStatusModalProps {
    onClose: () => void;
}

/** 아코디언에 넣을 한 줄. 입찰공고와 사전규격이 같은 모양을 쓴다. */
interface RowItem {
    title: string;
    sub: string;
    tag?: string;
}

const STORAGE_KEY = 'g2b_collection_modal_hide_until';

const fmt = (n: number) => n.toLocaleString('ko-KR');

export default function CollectionStatusModal({ onClose }: CollectionStatusModalProps) {
    const [collectionData, setCollectionData] = useState<CollectionResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    // 사전규격/발주계획 상세는 수집 결과에 실려오지 않는다. RTDB 를 직접 읽는다.
    // 매 수집마다 전량 교체되므로 현재 적재 목록 = 그 회차에 수집된 목록이다.
    // 앱이 이미 같은 경로를 구독 중이라 추가 전송은 없다.
    const { items: specItems, loading: specLoading } = usePreSpecs();

    useEffect(() => {
        // Firebase RTDB에서 실시간으로 수집 결과 조회
        const collectionRef = ref(db, '/collection_results/latest');
        const unsubscribe = onValue(
            collectionRef,
            (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    setCollectionData(data as CollectionResult);
                } else {
                    setCollectionData(null);
                }
                setLoading(false);
            },
            (error) => {
                console.error('수집 현황 로드 실패:', error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    const handleHideForToday = () => {
        const now = new Date();
        const hideUntil = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        localStorage.setItem(STORAGE_KEY, hideUntil.toISOString());
        onClose();
    };

    const toggle = (id: string) => {
        const next = new Set(expanded);
        if (next.has(id)) next.delete(id); else next.add(id);
        setExpanded(next);
    };

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-3xl p-8">
                    <div className="flex items-center gap-3">
                        <div className="w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-slate-600 font-medium">수집 현황을 불러오는 중...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!collectionData) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden border border-slate-200"
                >
                    <div className="p-10 text-center">
                        <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
                            <AlertTriangle size={32} className="text-amber-500" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">수집 데이터 없음</h3>
                        <p className="text-slate-500 text-sm leading-relaxed mb-6">
                            아직 오늘의 수집이 실행되지 않았거나,<br />
                            수집 결과 데이터가 존재하지 않습니다.
                        </p>
                        <button
                            onClick={onClose}
                            className="px-8 py-3 bg-slate-800 text-white font-bold rounded-2xl hover:bg-slate-900 transition-all text-sm"
                        >
                            닫기
                        </button>
                    </div>
                </motion.div>
            </div>
        );
    }

    // ── 도메인 분리 ────────────────────────────────────────────
    // keyword_results 에는 콜센터 키워드와 AX 가 한 맵에 섞여 들어온다.
    // keywords(= RTDB /search_keywords)에 있는 것만 콜센터, 나머지는 AX 도메인이다.
    const csKeywordSet = new Set(collectionData.keywords ?? []);
    const allKeywords = Object.entries(collectionData.keyword_results ?? {});
    const csKeywords = allKeywords.filter(([k]) => csKeywordSet.has(k));
    const axKeywords = allKeywords.filter(([k]) => !csKeywordSet.has(k));

    const csCollected = csKeywords.filter(([, n]) => n > 0);
    const csEmpty = csKeywords.filter(([, n]) => n === 0);

    // ── 종류별 합계 ────────────────────────────────────────────
    // 입찰공고는 '신규(증분)', 사전규격/발주계획은 매 수집마다 전량 교체되므로
    // '전체 적재량'이다. 같은 자리에 놓으면 오해하므로 라벨로 구분해 둔다.
    const axNew = collectionData.ax_result?.upserted_records ?? 0;
    const bidNew = (collectionData.total_count ?? 0) + axNew;

    const preSpecCount = collectionData.prespec_result?.pre_spec_count ?? 0;
    const orderPlanCount = collectionData.prespec_result?.order_plan_count ?? 0;
    const specTotal = preSpecCount + orderPlanCount;
    const hasSpecData = collectionData.prespec_result != null;

    const opinions = collectionData.imminent_opinions ?? [];

    // ── 입찰공고 목록 ──────────────────────────────────────────
    const bidRows = (keyword: string): RowItem[] =>
        (collectionData.keyword_bid_details?.[keyword] || []).map(b => ({
            title: b.공고명,
            sub: b.채권자명
        }));

    // ── 사전규격/발주계획 목록 ─────────────────────────────────
    // 한 건이 여러 키워드에 걸리면 각 키워드 아래에 함께 나타난다.
    // 입찰공고의 keyword_bid_details 도 같은 성질이라 표시 방식을 맞췄다.
    const specOf = (keyword: string) => specItems.filter(i => i.keywords.includes(keyword));

    const specRows = (keyword: string): RowItem[] =>
        specOf(keyword).map(i => ({
            title: i.title,
            sub: i.institution,
            tag: i.source === 'order_plan' ? '발주계획' : '사전규격'
        }));

    // AX 도메인 키워드는 데이터에서 뽑는다(콜센터 키워드가 아닌 것). 수집기의
    // AX_KEYWORDS 가 바뀌어도 화면이 따라가도록 하드코딩하지 않는다.
    const specKeywordsAll = [...new Set(specItems.flatMap(i => i.keywords))];
    const axSpecKeywords = specKeywordsAll.filter(k => !csKeywordSet.has(k)).sort();
    const csSpecCollected = csKeywords
        .map(([k]) => k)
        .filter(k => specOf(k).length > 0);
    const csSpecEmpty = csKeywords
        .map(([k]) => k)
        .filter(k => specOf(k).length === 0);

    /** 키워드 하나의 접이식 목록. 종류(입찰공고/사전규격)는 상위 섹션이 밝힌다. */
    const AccordionRow = ({ id, label, count, rows }: {
        id: string; label: string; count: number; rows: RowItem[];
    }) => {
        const isExpanded = expanded.has(id);

        return (
            <div className="border border-slate-200 rounded-2xl overflow-hidden hover:border-blue-300 transition-all">
                <button
                    onClick={() => toggle(id)}
                    className="w-full p-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-all"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                        <span className="font-bold text-slate-800">{label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-bold">
                            {fmt(count)}건
                        </span>
                        <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </motion.div>
                    </div>
                </button>

                <AnimatePresence>
                    {isExpanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                        >
                            <div className="p-4 bg-white border-t border-slate-200 max-h-60 overflow-y-auto">
                                <div className="space-y-2">
                                    {rows.length > 0 ? rows.map((r, idx) => (
                                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                            <div className="flex items-start gap-2">
                                                {r.tag && (
                                                    <span className={badge(r.tag === '발주계획' ? 'violet' : 'slate')}>
                                                        {r.tag}
                                                    </span>
                                                )}
                                                <p className="text-sm font-bold text-slate-800 line-clamp-2 min-w-0 flex-1">
                                                    {r.title}
                                                </p>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">{r.sub}</p>
                                        </div>
                                    )) : (
                                        <p className="text-sm text-slate-400 text-center py-3">상세 목록 없음</p>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    };

    const EmptyChips = ({ keywords }: { keywords: string[] }) => (
        <div className="mt-3 flex flex-wrap gap-2">
            {keywords.map(k => (
                <span
                    key={k}
                    className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-full text-xs font-medium border border-slate-200"
                >
                    {k}
                </span>
            ))}
        </div>
    );

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="bg-white rounded-[32px] w-full max-w-2xl shadow-2xl overflow-hidden border border-slate-200"
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-8 text-white">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                                    <TrendingUp size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black">오늘의 수집 현황</h2>
                                    <p className="text-blue-100 text-sm font-medium flex items-center gap-2 mt-1">
                                        <Calendar size={14} />
                                        {new Date(collectionData.collection_date).toLocaleString('ko-KR', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-xl transition-all">
                                <X size={24} />
                            </button>
                        </div>

                        {/* 데이터 종류별 요약. 숫자 성격(신규/전체)을 라벨에 박아둔다. */}
                        <div className="grid grid-cols-3 gap-4 mt-6">
                            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                                <p className="text-blue-100 text-xs font-bold tracking-wider mb-1">입찰공고</p>
                                <p className="text-3xl font-black">{fmt(bidNew)}<span className="text-sm ml-1">건</span></p>
                                <p className="text-blue-200 text-[11px] font-bold mt-1">신규</p>
                            </div>
                            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                                <p className="text-blue-100 text-xs font-bold tracking-wider mb-1">사전규격 · 발주계획</p>
                                <p className="text-3xl font-black">{hasSpecData ? fmt(specTotal) : '-'}<span className="text-sm ml-1">건</span></p>
                                <p className="text-blue-200 text-[11px] font-bold mt-1">전체</p>
                            </div>
                            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                                <p className="text-blue-100 text-xs font-bold tracking-wider mb-1">의견마감 임박</p>
                                <p className="text-3xl font-black">{fmt(opinions.length)}<span className="text-sm ml-1">건</span></p>
                                <p className="text-blue-200 text-[11px] font-bold mt-1">D-3 이내</p>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-8 max-h-[460px] overflow-y-auto space-y-8">

                        {/* ── 입찰공고 ─────────────────────────────── */}
                        <section>
                            <div className="flex items-center gap-3 mb-1">
                                <FileText size={18} className="text-blue-600 shrink-0" />
                                <h3 className="text-lg font-bold text-slate-800">입찰공고</h3>
                                <span className={badge('blue')}>신규 {fmt(bidNew)}건</span>
                            </div>
                            <p className="text-xs text-slate-400 mb-4 ml-[30px]">직전 수집 이후 새로 추가된 공고입니다.</p>

                            {axKeywords.length > 0 && (
                                <div className="mb-5">
                                    <p className="text-[11px] font-bold text-slate-400 tracking-wider mb-2">AX / BPR / ISP</p>
                                    <div className="space-y-3">
                                        {axKeywords.map(([keyword, count]) => (
                                            <AccordionRow
                                                key={keyword}
                                                id={`bid:${keyword}`}
                                                label={keyword}
                                                count={count}
                                                rows={bidRows(keyword)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <p className="text-[11px] font-bold text-slate-400 tracking-wider mb-2">
                                    콜센터 운영 위탁
                                    <span className="ml-2 text-slate-300">키워드 {csCollected.length}/{csKeywords.length}</span>
                                </p>

                                {csCollected.length > 0 ? (
                                    <div className="space-y-3">
                                        {csCollected.map(([keyword, count]) => (
                                            <AccordionRow
                                                key={keyword}
                                                id={`bid:${keyword}`}
                                                label={keyword}
                                                count={count}
                                                rows={bidRows(keyword)}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-400 py-3 px-4 bg-slate-50 rounded-2xl border border-slate-200">
                                        신규 공고 없음 — 모든 키워드에서 새 공고가 발견되지 않았습니다.
                                    </p>
                                )}

                                {csEmpty.length > 0 && <EmptyChips keywords={csEmpty.map(([k]) => k)} />}
                            </div>
                        </section>

                        {/* ── 사전규격 · 발주계획 ────────────────────── */}
                        {hasSpecData && (
                            <section className="pt-6 border-t border-slate-100">
                                <div className="flex items-center gap-3 mb-1">
                                    <ClipboardList size={18} className="text-violet-600 shrink-0" />
                                    <h3 className="text-lg font-bold text-slate-800">사전규격 · 발주계획</h3>
                                    <span className={badge('violet')}>전체 {fmt(specTotal)}건</span>
                                </div>
                                <p className="text-xs text-slate-400 mb-4 ml-[30px]">
                                    매 수집마다 전량 교체됩니다. 신규 건수가 아니라 현재 적재 총량입니다 (콜센터 · AX 합계).
                                </p>

                                <div className="grid grid-cols-2 gap-3 mb-5">
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                                        <p className="text-xs font-bold text-slate-400 mb-1">사전규격</p>
                                        <p className="text-2xl font-black text-slate-700 tabular-nums">{fmt(preSpecCount)}<span className="text-xs ml-1 font-bold">건</span></p>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                                        <p className="text-xs font-bold text-slate-400 mb-1">발주계획</p>
                                        <p className="text-2xl font-black text-slate-700 tabular-nums">{fmt(orderPlanCount)}<span className="text-xs ml-1 font-bold">건</span></p>
                                    </div>
                                </div>

                                {specLoading ? (
                                    <p className="text-sm text-slate-400 py-3 px-4 bg-slate-50 rounded-2xl border border-slate-200">
                                        품명 목록을 불러오는 중...
                                    </p>
                                ) : (
                                    <>
                                        {axSpecKeywords.length > 0 && (
                                            <div className="mb-5">
                                                <p className="text-[11px] font-bold text-slate-400 tracking-wider mb-2">AX / BPR / ISP</p>
                                                <div className="space-y-3">
                                                    {axSpecKeywords.map(k => (
                                                        <AccordionRow
                                                            key={k}
                                                            id={`spec:${k}`}
                                                            label={k}
                                                            count={specOf(k).length}
                                                            rows={specRows(k)}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div>
                                            <p className="text-[11px] font-bold text-slate-400 tracking-wider mb-2">
                                                콜센터 운영 위탁
                                                <span className="ml-2 text-slate-300">키워드 {csSpecCollected.length}/{csKeywords.length}</span>
                                            </p>

                                            {csSpecCollected.length > 0 ? (
                                                <div className="space-y-3">
                                                    {csSpecCollected.map(k => (
                                                        <AccordionRow
                                                            key={k}
                                                            id={`spec:${k}`}
                                                            label={k}
                                                            count={specOf(k).length}
                                                            rows={specRows(k)}
                                                        />
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-slate-400 py-3 px-4 bg-slate-50 rounded-2xl border border-slate-200">
                                                    해당 키워드로 적재된 건이 없습니다.
                                                </p>
                                            )}

                                            {csSpecEmpty.length > 0 && <EmptyChips keywords={csSpecEmpty} />}
                                        </div>

                                        <p className="text-[11px] text-slate-400 mt-3">
                                            ※ 한 건이 여러 키워드에 걸리면 각 키워드 아래에 함께 표시됩니다. 키워드별 건수의 합은 총계와 다를 수 있습니다.
                                        </p>
                                    </>
                                )}

                                {/* 의견등록 마감 임박. 규격을 바꿀 수 있는 유일한 창구라 목록으로 노출한다. */}
                                <div className="mt-5">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Clock size={14} className="text-amber-500 shrink-0" />
                                        <p className="text-[11px] font-bold text-slate-400 tracking-wider">의견등록 마감 임박 (D-3 이내)</p>
                                    </div>

                                    {opinions.length > 0 ? (
                                        <div className="space-y-2">
                                            {opinions.map((op, idx) => (
                                                <div key={idx} className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/70 flex items-start gap-3">
                                                    <span className={badge(op.dday <= 1 ? 'rose' : 'amber')}>
                                                        {op.dday === 0 ? '오늘 마감' : `D-${op.dday}`}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-bold text-slate-800 line-clamp-2">{op.title}</p>
                                                        <p className="text-xs text-slate-500 mt-0.5">
                                                            {op.institution} · {op.amountEok}억 · 마감 {op.deadline}
                                                        </p>
                                                    </div>
                                                    {op.docUrl && (
                                                        <a
                                                            href={op.docUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className={iconLink('slate')}
                                                            title="규격서 다운로드"
                                                        >
                                                            <ExternalLink size={13} />
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-400">해당 없음</p>
                                    )}
                                </div>
                            </section>
                        )}
                    </div>

                    {/* Footer - 오늘 하루 안보기 */}
                    <div className="px-8 py-3.5 bg-slate-50 border-t border-slate-200">
                        <button
                            onClick={handleHideForToday}
                            className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors text-xs"
                        >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                                <rect x="0.5" y="0.5" width="13" height="13" rx="2.5" stroke="currentColor" />
                            </svg>
                            오늘 하루 안보기
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}

// 모달을 표시할지 확인하는 헬퍼 함수
export function shouldShowCollectionModal(): boolean {
    const hideUntil = localStorage.getItem(STORAGE_KEY);
    if (!hideUntil) return true;

    const hideUntilDate = new Date(hideUntil);
    const now = new Date();

    return now > hideUntilDate;
}
