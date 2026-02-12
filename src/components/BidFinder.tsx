import { useState, useMemo } from 'react';
import { Search, RefreshCw, Filter, X, ExternalLink, Clock, AlertCircle, Building2 } from 'lucide-react';

// 원화(₩) 커스텀 아이콘 컴포넌트
const WonSign = ({ size = 24, className = '' }: { size?: number; className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M4 4l4 16" />
        <path d="M12 4l4 16" />
        <path d="M20 4l-4 16" />
        <line x1="2" y1="10" x2="22" y2="10" />
        <line x1="2" y1="14" x2="22" y2="14" />
    </svg>
);
import { motion, AnimatePresence } from 'framer-motion';
import { useFirestoreBids } from '../hooks/useFirestoreBids';
import { Bid } from '../types';

interface FilterState {
    searchQuery: string;
    minBudget: number;
    budgetToggle: boolean; // > 20억
    status: 'all' | 'before' | 'ongoing' | 'closed';
    reNotice: 'all' | 'Y' | 'N';
}

interface BidFinderProps {
    selectedYear: number;
}

const BidFinder = ({ selectedYear }: BidFinderProps) => {
    // Use the new hook that fetches from Firestore and maps to Bid type
    const { bids, loading, error } = useFirestoreBids();

    // We don't need local loading/error state if hook provides it, 
    // but the hook might not expose a 'refetch' easily without exposing it.
    // For now, let's rely on the hook's initial fetch and realtime updates (if any).
    // If manual refresh is needed, we might need to adjust the hook, but user just wants it to work.

    // Filters
    const [filters, setFilters] = useState<FilterState>({
        searchQuery: '',
        minBudget: 0,
        budgetToggle: false,
        status: 'all',
        reNotice: 'all'
    });

    const [selectedBid, setSelectedBid] = useState<Bid | null>(null);

    // Derived Logic for Status
    const getStatus = (bid: Bid) => {
        const now = new Date();
        const begin = bid.bidBeginDt ? new Date(bid.bidBeginDt) : null;
        const close = bid.bidClseDt ? new Date(bid.bidClseDt) : null;

        if (!begin || !close) return '정보 부족';
        if (now < begin) return '입찰 전';
        if (now >= begin && now <= close) return '진행중';
        if (now > close) return '마감';
        return '정보 부족';
    };

    const getRemainingTime = (bid: Bid) => {
        const now = new Date();
        const close = bid.bidClseDt ? new Date(bid.bidClseDt) : null;
        // qlfctRgstDt not in Bid type yet, strictly speaking, but we can add or ignore for now.
        // Let's use close date primarily.

        if (!close) return '-';
        if (close <= now) return '마감';

        const diff = close.getTime() - now.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        return `${days}일 ${hours}시간 남음`;
    };

    // Filter Logic
    const filteredBids = useMemo(() => {
        return bids.filter(bid => {
            // Year Filter
            // useFirestoreBids ensures 예상_연도 is a number
            if (bid.예상_연도 !== selectedYear) return false;

            // Search Query
            if (filters.searchQuery) {
                const query = filters.searchQuery.toLowerCase();
                const title = (bid.공고명 || '').toLowerCase();
                if (!title.includes(query)) return false;
            }

            // Budget
            const budget = Number(bid.asignBdgtAmt) || 0;
            const threshold = filters.budgetToggle ? 2000000000 : filters.minBudget;
            if (budget < threshold) return false;

            // Status
            const currentStatus = getStatus(bid);
            if (filters.status !== 'all') {
                if (filters.status === 'ongoing' && currentStatus !== '진행중') return false;
                if (filters.status === 'before' && currentStatus !== '입찰 전') return false;
                if (filters.status === 'closed' && currentStatus !== '마감') return false;
            }

            // Re-Notice
            const isRe = bid.reNtceYn === 'Y' || bid.reNtceYn === '재공고';
            if (filters.reNotice === 'Y' && !isRe) return false;
            if (filters.reNotice === 'N' && isRe) return false;

            return true;
        });
    }, [bids, filters, selectedYear]);

    // Stats
    const stats = useMemo(() => {
        const total = filteredBids.length;
        const avgBudget = total > 0 ? filteredBids.reduce((sum, b) => sum + (Number(b.asignBdgtAmt) || 0), 0) / total : 0;
        const maxBudget = total > 0 ? Math.max(...filteredBids.map(b => Number(b.asignBdgtAmt) || 0)) : 0;
        const reCount = filteredBids.filter(b => b.reNtceYn === 'Y' || b.reNtceYn === '재공고').length;
        const reRate = total > 0 ? (reCount / total) * 100 : 0;

        return { total, avgBudget, maxBudget, reRate, reCount };
    }, [filteredBids]);

    const formatMoney = (amount: number) => {
        const num = Number(amount);
        if (!num || isNaN(num)) return '-';
        if (num >= 100000000) {
            const eok = num / 100000000;
            // 10억 이상: 정수, 10억 미만: 소수 1자리 (단, .0이면 정수로)
            if (eok >= 10) return `${Math.round(eok).toLocaleString()}억원`;
            const rounded = Math.round(eok * 10) / 10;
            return rounded % 1 === 0 ? `${rounded}억원` : `${rounded.toFixed(1)}억원`;
        }
        if (num >= 10000) {
            return `${Math.round(num / 10000).toLocaleString()}만원`;
        }
        return `${Math.round(num).toLocaleString()}원`;
    };

    return (
        <div className="flex flex-col h-full bg-[#F8FAFC]">
            {/* Header / Top Bar */}
            <div className="bg-white border-b border-slate-200 px-8 py-5 flex flex-col gap-4 shadow-sm z-10 sticky top-0">
                {/* Filter Bar */}
                <div className="flex flex-wrap items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">

                    <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 w-64 shadow-sm">
                        <Search size={14} className="text-slate-400" />
                        <input
                            type="text"
                            placeholder="공고명 검색..."
                            value={filters.searchQuery}
                            onChange={(e) => setFilters(prev => ({ ...prev, searchQuery: e.target.value }))}
                            className="w-full bg-transparent text-xs font-bold text-slate-600 outline-none"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${filters.budgetToggle ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}>
                                {filters.budgetToggle && <div className="w-2 h-2 bg-white rounded-sm" />}
                            </div>
                            <input
                                type="checkbox"
                                className="hidden"
                                checked={filters.budgetToggle}
                                onChange={(e) => setFilters(prev => ({ ...prev, budgetToggle: e.target.checked }))}
                            />
                            <span className="text-xs font-bold text-slate-600">배정예산 20억 이상</span>
                        </label>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                        <select
                            className="bg-white border border-slate-200 text-xs font-bold text-slate-600 rounded-lg px-3 py-2 outline-none"
                            value={filters.status}
                            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
                        >
                            <option value="all">전체 상태</option>
                            <option value="before">입찰 전</option>
                            <option value="ongoing">진행중</option>
                            <option value="closed">마감</option>
                        </select>
                        <select
                            className="bg-white border border-slate-200 text-xs font-bold text-slate-600 rounded-lg px-3 py-2 outline-none"
                            value={filters.reNotice}
                            onChange={(e) => setFilters(prev => ({ ...prev, reNotice: e.target.value as any }))}
                        >
                            <option value="all">재공고: 전체</option>
                            <option value="Y">재공고: Y</option>
                            <option value="N">재공고: N</option>
                        </select>
                        {error && <span className="text-xs text-rose-500 font-bold">오류: {error.message}</span>}
                        {loading && (
                            <span className="flex items-center gap-2 text-xs text-slate-400 font-bold">
                                <RefreshCw size={14} className="animate-spin" />
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6">

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Filter size={18} /></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">검색 결과</span>
                        </div>
                        <p className="text-2xl font-black text-slate-800">{stats.total.toLocaleString()} <span className="text-sm font-bold text-slate-400">건</span></p>
                    </div>
                    <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-green-50 text-green-600 rounded-lg"><WonSign size={18} /></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">평균 예산</span>
                        </div>
                        <p className="text-2xl font-black text-slate-800">{formatMoney(stats.avgBudget)}</p>
                    </div>
                    <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><WonSign size={18} /></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">최대 예산</span>
                        </div>
                        <p className="text-2xl font-black text-slate-800">{formatMoney(stats.maxBudget)}</p>
                    </div>
                    <div className="bg-white rounded-[24px] p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg"><AlertCircle size={18} /></div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">재공고 비율</span>
                        </div>
                        <div className="flex items-end gap-2">
                            <p className="text-2xl font-black text-slate-800">{stats.reRate.toFixed(1)}%</p>
                            <span className="text-sm font-bold text-slate-400 mb-1">({stats.reCount}건)</span>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm min-h-[400px]">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-32">공고일시</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">공고명 / 기관</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right w-32">배정예산</th>
-                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-36">상태</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-24">재공고</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredBids.length > 0 ? (
                                    filteredBids.map((bid, idx) => {
                                        const status = getStatus(bid);
                                        const isRe = bid.reNtceYn === 'Y' || bid.reNtceYn === '재공고';

                                        return (
                                            <tr
                                                key={`${bid.bid_id}-${idx}`}
                                                onClick={() => setSelectedBid(bid)}
                                                className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="text-xs font-bold text-slate-600">{bid.예상_입찰일?.split('T')[0]}</div>
                                                    <div className="text-[10px] text-slate-400">{bid.예상_입찰일?.split('T')[1]?.substring(0, 5)}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-sm text-slate-700 group-hover:text-blue-600 transition-colors line-clamp-1 mb-1">
                                                        {bid.공고명}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                                        <Building2 size={12} />
                                                        <span>{bid.실수요기관}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="font-bold text-sm text-slate-600">{formatMoney(bid.asignBdgtAmt)}</div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${status === '진행중' ? 'bg-blue-50 text-blue-600' :
                                                        status === '마감' ? 'bg-slate-100 text-slate-400' :
                                                            'bg-amber-50 text-amber-600'
                                                        }`}>
                                                        {status}
                                                    </span>
                                                    {status === '진행중' && (
                                                        <div className="text-[9px] text-blue-500 font-bold mt-1">
                                                            {getRemainingTime(bid)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {isRe ? (
                                                        <span className="w-6 h-6 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center text-[10px] font-bold mx-auto">Y</span>
                                                    ) : (
                                                        <span className="text-slate-300">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="py-20 text-center text-slate-400 text-sm font-medium italic">
                                            조건에 맞는 공고가 없습니다.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Detail Modal */}
            <AnimatePresence>
                {selectedBid && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedBid(null)}
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative bg-white rounded-[32px] w-full max-w-2xl shadow-2xl overflow-hidden border border-white/20 max-h-[90vh] flex flex-col"
                        >
                            {/* Modal Header */}
                            <div className="p-8 border-b border-slate-100 flex items-start justify-between bg-slate-50/50 shrink-0">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${selectedBid.reNtceYn === 'Y' || selectedBid.reNtceYn === '재공고' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>
                                            {selectedBid.reNtceYn === 'Y' || selectedBid.reNtceYn === '재공고' ? '재공고' : '일반공고'}
                                        </span>
                                        <span className="text-slate-400 text-xs font-bold">{selectedBid.bid_id}</span>
                                    </div>
                                    <h3 className="text-xl font-black text-slate-800 leading-snug">{selectedBid.공고명}</h3>
                                </div>
                                <button onClick={() => setSelectedBid(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                                    <X size={24} />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
                                {/* Key Info Grid */}
                                <div className="grid grid-cols-2 gap-6 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">공고기관</p>
                                        <p className="font-bold text-slate-700">{selectedBid.ntceInsttNm}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">수요기관</p>
                                        <p className="font-bold text-slate-700">{selectedBid.실수요기관}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">배정예산</p>
                                        <p className="font-bold text-blue-600 text-lg">{formatMoney(selectedBid.asignBdgtAmt)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">추정가격</p>
                                        <p className="font-bold text-slate-700">{formatMoney(selectedBid.presmptPrce)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">담당자</p>
                                        <p className="font-bold text-slate-700">{selectedBid.ntceInsttOfclNm || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">연락처</p>
                                        <p className="font-bold text-slate-700">{selectedBid.ntceInsttOfclTelNo || '-'}</p>
                                    </div>
                                </div>

                                {/* Dates */}
                                <div>
                                    <h4 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
                                        <Clock size={16} className="text-slate-400" /> 주요 일정
                                    </h4>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                                            <span className="text-slate-500 font-medium">입찰공고일시</span>
                                            <span className="font-bold text-slate-700">{selectedBid.예상_입찰일?.replace('T', ' ')}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                                            <span className="text-slate-500 font-medium">입찰마감일시</span>
                                            <span className="font-bold text-slate-700">{selectedBid.bidClseDt?.replace('T', ' ')}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm border-b border-slate-100 pb-2">
                                            <span className="text-slate-500 font-medium">개찰일시</span>
                                            <span className="font-bold text-slate-700">{selectedBid.bidBeginDt?.replace('T', ' ')}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Attachments */}
                                <div>
                                    <h4 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
                                        <ExternalLink size={16} className="text-slate-400" /> 공고규격서 및 첨부파일
                                    </h4>
                                    <div className="grid grid-cols-1 gap-2">
                                        {[...Array(10)].map((_, i) => {
                                            const idx = i + 1;
                                            const url = selectedBid[`ntceSpecDocUrl${idx}`];
                                            const name = selectedBid[`ntceSpecFileNm${idx}`] || `첨부파일 ${idx}`;

                                            if (url) {
                                                return (
                                                    <a
                                                        key={idx}
                                                        href={url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
                                                    >
                                                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-white group-hover:text-blue-500">
                                                            <ExternalLink size={14} />
                                                        </div>
                                                        <span className="text-sm font-bold text-slate-600 group-hover:text-blue-700">{name}</span>
                                                    </a>
                                                );
                                            }
                                            return null;
                                        })}
                                        {!selectedBid.ntceSpecDocUrl1 && (
                                            <p className="text-sm text-slate-400 italic">첨부파일이 없습니다.</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="p-6 border-t border-slate-100 bg-slate-50 shrink-0">
                                <button onClick={() => setSelectedBid(null)} className="w-full py-4 bg-slate-200 hover:bg-slate-300 text-slate-600 font-bold rounded-xl transition-colors">
                                    닫기
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default BidFinder;
