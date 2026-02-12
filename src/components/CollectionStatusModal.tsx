import { useState, useEffect } from 'react';
import { X, Calendar, TrendingUp, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, ref, onValue } from '../api/firebase';

interface BidDetail {
    공고명: string;
    채권자명: string;
}

interface CollectionResult {
    total_count: number;
    collection_date: string;
    keyword_results: Record<string, number>;
    keywords: string[];
    keyword_bid_details?: Record<string, BidDetail[]>;
    bid_details: BidDetail[];
    ax_result?: {
        upserted_records: number;
        total_collected: number;
        filtered_records?: number;
    };
    ax_bid_details?: BidDetail[];
}

interface CollectionStatusModalProps {
    onClose: () => void;
}

const STORAGE_KEY = 'g2b_collection_modal_hide_until';

export default function CollectionStatusModal({ onClose }: CollectionStatusModalProps) {
    const [collectionData, setCollectionData] = useState<CollectionResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [expandedKeywords, setExpandedKeywords] = useState<Set<string>>(new Set());

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

    const toggleKeyword = (keyword: string) => {
        const newExpanded = new Set(expandedKeywords);
        if (newExpanded.has(keyword)) {
            newExpanded.delete(keyword);
        } else {
            newExpanded.add(keyword);
        }
        setExpandedKeywords(newExpanded);
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

    // 모든 키워드 표시 (수집 결과가 있는 키워드)
    const allKeywords = Object.entries(collectionData.keyword_results);
    const collectedKeywords = allKeywords.filter(([_, count]) => count > 0);
    const emptyKeywords = allKeywords.filter(([_, count]) => count === 0);

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
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-white/20 rounded-xl transition-all"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        {/* Summary Stats */}
                        <div className="grid grid-cols-3 gap-4 mt-6">
                            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                                <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1">CS 수집</p>
                                <p className="text-3xl font-black">{collectionData.total_count}<span className="text-sm ml-1">건</span></p>
                            </div>
                            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                                <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1">AX 수집</p>
                                <p className="text-3xl font-black">{collectionData.ax_result?.upserted_records ?? 0}<span className="text-sm ml-1">건</span></p>
                            </div>
                            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                                <p className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1">활성 키워드</p>
                                <p className="text-3xl font-black">{collectedKeywords.length}<span className="text-sm ml-1">/{allKeywords.length}</span></p>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="p-8 max-h-[500px] overflow-y-auto">
                        {/* 수집된 키워드 */}
                        {collectedKeywords.length > 0 && (
                            <>
                                <h3 className="text-lg font-bold text-slate-800 mb-4">수집된 키워드</h3>
                                <div className="space-y-3 mb-6">
                                    {collectedKeywords.map(([keyword, count]) => {
                                        const isExpanded = expandedKeywords.has(keyword);

                                        // 키워드별 공고 목록 (keyword_bid_details에서 정확히 매칭)
                                        const bids: BidDetail[] = collectionData.keyword_bid_details?.[keyword] || [];

                                        return (
                                            <div
                                                key={keyword}
                                                className="border border-slate-200 rounded-2xl overflow-hidden hover:border-blue-300 transition-all"
                                            >
                                                <button
                                                    onClick={() => toggleKeyword(keyword)}
                                                    className="w-full p-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-all"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                                                        <span className="font-bold text-slate-800">{keyword.replace(' (Firestore)', '')}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-bold">
                                                            {count}건
                                                        </span>
                                                        <motion.div
                                                            animate={{ rotate: isExpanded ? 180 : 0 }}
                                                            transition={{ duration: 0.2 }}
                                                        >
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
                                                                    {bids.length > 0 ? bids.map((bid, idx) => (
                                                                        <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                                                            <p className="text-sm font-bold text-slate-800 line-clamp-2">
                                                                                {bid.공고명}
                                                                            </p>
                                                                            <p className="text-xs text-slate-500 mt-1">
                                                                                {bid.채권자명}
                                                                            </p>
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
                                    })}
                                </div>
                            </>
                        )}

                        {/* 수집 결과 없는 키워드 */}
                        {emptyKeywords.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider">미수집 키워드 (0건)</h3>
                                <div className="flex flex-wrap gap-2">
                                    {emptyKeywords.map(([keyword]) => (
                                        <span
                                            key={keyword}
                                            className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-full text-xs font-medium border border-slate-200"
                                        >
                                            {keyword}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 수집 결과가 전혀 없는 경우 */}
                        {collectedKeywords.length === 0 && (
                            <div className="text-center py-8">
                                <AlertTriangle size={32} className="text-amber-400 mx-auto mb-3" />
                                <p className="text-slate-600 font-bold">오늘 수집된 공고가 없습니다.</p>
                                <p className="text-slate-400 text-sm mt-1">모든 키워드에서 신규 공고가 발견되지 않았습니다.</p>
                            </div>
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
