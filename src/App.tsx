import { useState, useMemo, useEffect } from 'react'
import {
    LayoutDashboard,
    FileText,
    TrendingUp,
    Calendar,
    ChevronRight,
    ChevronLeft,
    Search,
    Edit2,
    X,
    Save,
    ArrowRight,
    Globe,
    Bell,
    Award
} from 'lucide-react'

// 원화(₩) 커스텀 아이콘 컴포넌트
const WonSign = ({ size = 24, className = '' }: { size?: number; className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M4 4l4 16" />
        <path d="M12 4l4 16" />
        <path d="M20 4l-4 16" />
        <line x1="2" y1="10" x2="22" y2="10" />
        <line x1="2" y1="14" x2="22" y2="14" />
    </svg>
)
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Bar,
    Line,
    ComposedChart
} from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import { useBids } from './hooks/useBids'
import { Bid } from './types'
import { updateServiceDuration } from './api/bidActions'
import BidFinder from './components/BidFinder'
import CollectionStatusModal, { shouldShowCollectionModal } from './components/CollectionStatusModal'

function App() {
    const { bids, loading } = useBids()
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
    const [monthPage, setMonthPage] = useState(0)
    const [activeTab, setActiveTab] = useState<'dashboard' | 'list' | 'ax-bpr-isp'>('dashboard')
    const [selectedBidId, setSelectedBidId] = useState<string | null>(null)
    const [showCollectionModal, setShowCollectionModal] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    // 용역기간 편집 상태
    const [editingBid, setEditingBid] = useState<Bid | null>(null)
    const [editDuration, setEditDuration] = useState(0)

    useEffect(() => {
        if (shouldShowCollectionModal()) {
            setShowCollectionModal(true)
        }
    }, [])

    const monthGroups = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]
    const currentMonths = monthGroups[monthPage]

    // 연도 필터링된 데이터
    const yearData = useMemo(() => bids.filter(b => b.예상_연도 === selectedYear), [bids, selectedYear])

    // 금액 포맷 헬퍼
    const formatAmount = (amount: number) => {
        const num = Number(amount)
        if (!num || isNaN(num) || num === 0) return '-'
        if (num >= 1000000000000) return `${(num / 1000000000000).toFixed(1)}조`
        if (num >= 100000000) return `${(num / 100000000).toFixed(1)}억`
        if (num >= 10000) return `${(num / 10000).toFixed(0)}만`
        return num.toLocaleString()
    }

    // 차트 데이터: 실제/예측 사업금액 (누적) + 공고수 (합산)
    const chartData = useMemo(() => {
        return Array.from({ length: 12 }, (_, i) => {
            const month = i + 1
            const monthBids = yearData.filter(b => b.예상_입찰월 === month)
            const actualBids = monthBids.filter(b => !b.is_prediction)
            const predBids = monthBids.filter(b => b.is_prediction)
            const actualAmount = actualBids.reduce((sum, b) => sum + (b['계약 기간 내'] || 0), 0)
            const predAmount = predBids.reduce((sum, b) => sum + (b['계약 기간 내'] || 0), 0)
            return {
                name: `${month}월`,
                actualAmount: Math.round(actualAmount / 100000000 * 10) / 10,
                predAmount: Math.round(predAmount / 100000000 * 10) / 10,
                bids: monthBids.length,
            }
        })
    }, [yearData])

    // 다음 예정 입찰 (예측 포함, 현재 이후 가장 가까운 순)
    const upcomingBids = useMemo(() => {
        const now = new Date()
        return [...yearData]
            .filter(b => new Date(b.예상_입찰일 || `${b.예상_연도}-${String(b.예상_입찰월).padStart(2, '0')}-01`) >= now)
            .sort((a, b) => new Date(a.예상_입찰일 || `${a.예상_연도}-${String(a.예상_입찰월).padStart(2, '0')}-01`).getTime() - new Date(b.예상_입찰일 || `${b.예상_연도}-${String(b.예상_입찰월).padStart(2, '0')}-01`).getTime())
            .slice(0, 10)
    }, [yearData])

    // 연간 통계 (원본 데이터만)
    const stats = useMemo(() => {
        const originalBids = yearData.filter(b => !b.is_prediction)
        const totalAmount = originalBids.reduce((sum, b) => sum + (b['계약 기간 내'] || 0), 0)
        const completedBids = originalBids.filter(b => b.입찰결과_1순위 && b.입찰결과_1순위.length > 0)
        const predictionBids = yearData.filter(b => b.is_prediction)
        return {
            totalAmount,
            totalBids: originalBids.length,
            completedBids: completedBids.length,
            completionRate: originalBids.length > 0 ? Math.round(completedBids.length / originalBids.length * 100) : 0,
            predictionCount: predictionBids.length,
        }
    }, [yearData])

    const handleBidClick = (bid: Bid) => {
        const page = Math.floor((bid.예상_입찰월 - 1) / 4)
        setMonthPage(page)
        setSelectedBidId(bid.bid_id)
        setActiveTab('dashboard')
        setTimeout(() => {
            const element = document.getElementById(`bid-${bid.bid_id}`)
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
        }, 100)
    }

    const handleEdit = (bid: Bid) => {
        // 예측 데이터면 원본 bid_id로 추적
        const baseBid = bid.is_prediction
            ? bids.find(b => b.bid_id === bid.bid_id.split('_pred_')[0]) || bid
            : bid
        setEditingBid(baseBid)
        setEditDuration(baseBid['용역기간(개월)'] || 0)
    }

    const handleSave = async () => {
        if (editingBid) {
            const baseId = editingBid.bid_id.split('_pred_')[0]
            await updateServiceDuration(baseId, editDuration)
            setEditingBid(null)
        }
    }

    if (loading) {
        return (
            <div className="h-screen w-screen flex items-center justify-center bg-white">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-medium tracking-tight">G2B 데이터를 동기화 중입니다...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex h-screen bg-[#F1F5F9] text-[#1E293B] relative flex-col">
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <aside className="w-72 bg-[#0F172A] text-white hidden md:flex flex-col shrink-0">
                    <div className="p-6 px-7">
                        <div className="flex items-center gap-3 mb-10">
                            <div className="w-9 h-9 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                                <TrendingUp size={20} className="text-white" />
                            </div>
                            <span className="text-xl font-bold tracking-tight">MetaM-나라장터</span>
                        </div>

                        <nav className="space-y-4 relative z-30">
                            <div className="space-y-1">
                                <button
                                    onClick={() => setActiveTab('dashboard')}
                                    className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl font-bold transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/25' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
                                >
                                    <LayoutDashboard size={20} />
                                    <span className="text-sm">콜센터 운영 위탁</span>
                                </button>

                                <div className="pl-4 pr-4">
                                    <button
                                        onClick={() => setActiveTab('list')}
                                        className={`w-full flex items-center gap-3 px-5 py-3 rounded-xl font-bold transition-all ${activeTab === 'list' ? 'bg-slate-800 text-blue-400' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'list' ? 'bg-blue-400' : 'bg-slate-600'}`} />
                                        <span className="text-xs">공고 리스트</span>
                                    </button>
                                </div>
                            </div>

                            <div className="pt-2">
                                <button
                                    onClick={() => setActiveTab('ax-bpr-isp')}
                                    className={`w-full flex items-center gap-3 px-5 py-4 rounded-2xl font-bold transition-all ${activeTab === 'ax-bpr-isp' ? 'bg-blue-600 text-white shadow-xl shadow-blue-500/25' : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'}`}
                                >
                                    <Globe size={20} />
                                    <span className="text-sm">AX / BPR / ISP</span>
                                </button>
                            </div>
                        </nav>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 flex flex-col overflow-hidden">
                    <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-10 shadow-sm z-10 sticky top-0 shrink-0">
                        <div className="flex items-center gap-4">
                            <h2 className="text-xl font-bold text-slate-800">
                                {activeTab === 'dashboard' ? '입찰 공고 종합 현황' :
                                    activeTab === 'list' ? '전체 입찰 공고 목록' : 'G2B 실시간 공고 모니터링'}
                            </h2>
                            {activeTab === 'dashboard' && stats.predictionCount > 0 && (
                                <div className="px-3 py-1 bg-rose-50 text-rose-500 rounded-full text-[10px] font-bold border border-rose-100">
                                    예측 {stats.predictionCount}건 포함
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setShowCollectionModal(true)}
                                className="p-2.5 hover:bg-blue-50 rounded-xl transition-all text-slate-600 hover:text-blue-600 relative"
                                title="오늘의 수집 현황"
                            >
                                <Bell size={20} />
                                <span className="absolute top-1 right-1 w-2 h-2 bg-blue-600 rounded-full"></span>
                            </button>

                            <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
                                <button onClick={() => setSelectedYear((y: number) => y - 1)} className="p-1.5 hover:bg-white rounded-lg transition-all">
                                    <ChevronLeft size={16} />
                                </button>
                                <span className="px-4 font-bold text-sm text-slate-700">{selectedYear}년</span>
                                <button onClick={() => setSelectedYear((y: number) => y + 1)} className="p-1.5 hover:bg-white rounded-lg transition-all">
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>

                        <div />
                    </header>

                    {/* Scrollable Area */}
                    {activeTab === 'ax-bpr-isp' ? (
                        <div className="flex-1 overflow-hidden h-full">
                            <BidFinder selectedYear={selectedYear} />
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-[#F8FAFC]">

                            {activeTab === 'dashboard' ? (
                                <>
                                    {/* Top Grid: Chart & Recent Bids */}
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
                                        {/* Left Side: Stats + Chart */}
                                        <div className="lg:col-span-2 flex flex-col gap-8">
                                            {/* Annual Stats Row */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                <div className="bg-white rounded-[32px] p-7 shadow-sm border border-slate-200 flex items-center gap-5 hover:shadow-md transition-shadow">
                                                    <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                                                        <WonSign size={28} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">연간 총 사업금액</p>
                                                        <p className="text-2xl font-black text-slate-800">
                                                            {formatAmount(stats.totalAmount)} <span className="text-sm font-bold text-slate-400">원</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="bg-white rounded-[32px] p-7 shadow-sm border border-slate-200 flex items-center gap-5 hover:shadow-md transition-shadow">
                                                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 shrink-0">
                                                        <FileText size={28} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">연간 공고 수</p>
                                                        <p className="text-2xl font-black text-slate-800">
                                                            {stats.totalBids} <span className="text-sm font-bold text-slate-400">건</span>
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="bg-white rounded-[32px] p-7 shadow-sm border border-slate-200 flex items-center gap-5 hover:shadow-md transition-shadow">
                                                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                                                        <Award size={28} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1">낙찰 완료</p>
                                                        <p className="text-2xl font-black text-slate-800">
                                                            {stats.completedBids} <span className="text-sm font-bold text-slate-400">건 ({stats.completionRate}%)</span>
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Main Chart */}
                                            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-200 flex-1 flex flex-col min-h-[400px]">
                                                <div className="flex items-center justify-between mb-8">
                                                    <div>
                                                        <h3 className="text-lg font-bold text-slate-800">월별 사업금액 및 공고 현황</h3>
                                                        <div className="flex gap-5 mt-1.5 font-bold">
                                                            <div className="flex items-center gap-1.5 text-[10px] text-blue-500">
                                                                <div className="w-2.5 h-2.5 bg-blue-500 rounded-sm" /> 사업금액 (억)
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-[10px] text-rose-400">
                                                                <div className="w-2.5 h-2.5 bg-rose-300 rounded-sm" /> 예측 사업금액 (억)
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                                                <div className="w-4 h-0.5 bg-slate-400 rounded" /> 공고수 (예측포함)
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex-1 w-full min-h-[300px]">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <ComposedChart data={chartData} margin={{ top: 20, right: 40, left: 10, bottom: 10 }}>
                                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.5} />
                                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94A3B8', fontSize: 11 }} dy={10} />
                                                            <YAxis
                                                                yAxisId="left"
                                                                axisLine={false}
                                                                tickLine={false}
                                                                tick={{ fill: '#3B82F6', fontSize: 10, fontWeight: 'bold' }}
                                                                label={{ value: '사업금액(억)', angle: -90, position: 'insideLeft', offset: -5, style: { fontSize: 10, fill: '#94A3B8', fontWeight: 'bold' } }}
                                                            />
                                                            <YAxis
                                                                yAxisId="right"
                                                                orientation="right"
                                                                axisLine={false}
                                                                tickLine={false}
                                                                tick={{ fill: '#64748B', fontSize: 10, fontWeight: 'bold' }}
                                                                label={{ value: '공고수', angle: 90, position: 'insideRight', offset: -5, style: { fontSize: 10, fill: '#94A3B8', fontWeight: 'bold' } }}
                                                            />
                                                            <Tooltip
                                                                cursor={{ fill: '#F8FAFC' }}
                                                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px -5px rgba(0,0,0,0.1)', padding: '12px' }}
                                                                formatter={(value: any, name: string) => {
                                                                    if (name === 'actualAmount') return [`${value}억`, '실제 사업금액']
                                                                    if (name === 'predAmount') return [`${value}억`, '예측 사업금액']
                                                                    if (name === 'bids') return [`${value}건`, '공고수 (예측포함)']
                                                                    return [value, name]
                                                                }}
                                                            />
                                                            <Bar yAxisId="left" dataKey="actualAmount" stackId="amount" barSize={34} fill="#3B82F6" radius={[0, 0, 0, 0]} />
                                                            <Bar yAxisId="left" dataKey="predAmount" stackId="amount" barSize={34} fill="#FDA4AF" radius={[4, 4, 0, 0]} />
                                                            <Line
                                                                yAxisId="right"
                                                                type="monotone"
                                                                dataKey="bids"
                                                                stroke="#64748B"
                                                                strokeWidth={3}
                                                                dot={{ r: 4, fill: '#fff', stroke: '#64748B', strokeWidth: 2 }}
                                                                activeDot={{ r: 6, fill: '#64748B' }}
                                                                label={{
                                                                    position: 'top',
                                                                    formatter: (value: any) => value > 0 ? `${value}건` : '',
                                                                    fill: '#64748B',
                                                                    fontSize: 10,
                                                                    fontWeight: 'bold'
                                                                }}
                                                            />
                                                        </ComposedChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Upcoming Bids (예측 포함) */}
                                        <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-200 h-full flex flex-col justify-between min-h-[550px]">
                                            <div>
                                                <h3 className="text-lg font-bold mb-7 flex items-center gap-2 text-slate-800">
                                                    <Calendar size={22} className="text-blue-500" /> 다음 예정 입찰 정보
                                                </h3>
                                                <div className="space-y-5">
                                                    {upcomingBids.slice(0, 7).map((bid) => (
                                                        <div
                                                            key={bid.bid_id}
                                                            onClick={() => handleBidClick(bid)}
                                                            className={`group relative pl-6 border-l-2 transition-colors py-1 cursor-pointer ${bid.is_prediction ? 'border-rose-200 hover:border-rose-400' : 'border-slate-100 hover:border-blue-400'}`}
                                                        >
                                                            <div className={`absolute -left-[5px] top-2 w-2 h-2 rounded-full transition-colors ${bid.is_prediction ? 'bg-rose-300 group-hover:bg-rose-500' : 'bg-slate-300 group-hover:bg-blue-500'}`} />
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{bid.예상_년월}</p>
                                                                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${bid.is_prediction ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500'}`}>
                                                                        {bid.is_prediction ? `${bid.prediction_count}차 Pred` : 'Actual'}
                                                                    </span>
                                                                    {bid['계약 기간 내'] > 0 && (
                                                                        <span className="text-[9px] font-black text-blue-500">{formatAmount(bid['계약 기간 내'])}</span>
                                                                    )}
                                                                </div>
                                                                {bid.공고URL && !bid.is_prediction ? (
                                                                    <a
                                                                        href={bid.공고URL}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="text-[13px] font-bold text-slate-700 line-clamp-2 mt-0.5 leading-snug group-hover:text-blue-600 transition-colors hover:underline"
                                                                    >
                                                                        {bid.공고명}
                                                                    </a>
                                                                ) : (
                                                                    <p className={`text-[13px] font-bold line-clamp-2 mt-0.5 leading-snug transition-colors ${bid.is_prediction ? 'text-rose-600 group-hover:text-rose-700' : 'text-slate-700 group-hover:text-blue-600'}`}>{bid.공고명}</p>
                                                                )}
                                                                <p className="text-[10px] text-slate-400 mt-1">{bid.실수요기관}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {upcomingBids.length === 0 && (
                                                        <p className="text-sm text-slate-400 text-center py-8 italic">예정된 입찰 정보가 없습니다</p>
                                                    )}
                                                </div>
                                            </div>
                                            <button onClick={() => setActiveTab('list')} className="w-full mt-8 py-4 bg-slate-50 text-slate-600 text-[12px] font-bold rounded-[20px] hover:bg-blue-600 hover:text-white transition-all border border-slate-100 flex items-center justify-center gap-2 group">
                                                전체 공고 리스트 보기 <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Monthly Section with 4-month Navigation */}
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xl font-bold flex items-center gap-2">
                                                <FileText size={22} className="text-blue-600" /> 월별 공고 상세 리스트
                                            </h3>
                                            <div className="flex bg-white rounded-xl p-1 border border-slate-200">
                                                <button
                                                    onClick={() => setMonthPage(prev => Math.max(0, prev - 1))}
                                                    className="p-2 hover:bg-slate-50 rounded-lg disabled:opacity-30"
                                                    disabled={monthPage === 0}
                                                >
                                                    <ChevronLeft size={18} />
                                                </button>
                                                <div className="px-6 flex items-center text-sm font-bold text-slate-600">
                                                    {currentMonths[0]}월 - {currentMonths[3]}월
                                                </div>
                                                <button
                                                    onClick={() => setMonthPage(prev => Math.min(2, prev + 1))}
                                                    className="p-2 hover:bg-slate-50 rounded-lg disabled:opacity-30"
                                                    disabled={monthPage === 2}
                                                >
                                                    <ChevronRight size={18} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                                            {currentMonths.map(month => {
                                                const monthBids = yearData.filter(b => b.예상_입찰월 === month)
                                                const monthAmount = monthBids.filter(b => !b.is_prediction).reduce((sum, b) => sum + (b['계약 기간 내'] || 0), 0)
                                                return (
                                                    <div key={month} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 h-96 flex flex-col">
                                                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-50">
                                                            <span className="text-lg font-black text-blue-600">{month}월</span>
                                                            <div className="text-right">
                                                                <span className="text-xs font-bold text-slate-400">{monthBids.length}건</span>
                                                                {monthAmount > 0 && (
                                                                    <span className="text-xs font-bold text-blue-500 ml-2">{formatAmount(monthAmount)}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                                                            {monthBids.length > 0 ? (
                                                                monthBids.map(bid => {
                                                                    const isSelected = selectedBidId === bid.bid_id
                                                                    return (
                                                                        <div
                                                                            key={bid.bid_id}
                                                                            id={`bid-${bid.bid_id}`}
                                                                            onClick={() => setSelectedBidId(isSelected ? null : bid.bid_id)}
                                                                            className={`p-3 rounded-2xl border transition-all cursor-pointer ${isSelected
                                                                                ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-200 ring-2 ring-blue-100'
                                                                                : bid.is_prediction
                                                                                    ? 'bg-rose-50/50 border-rose-100 hover:border-rose-200'
                                                                                    : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                                                                                }`}
                                                                        >
                                                                            <div className="flex justify-between items-start gap-2 mb-2">
                                                                                <p className={`text-[11px] font-bold leading-snug line-clamp-2 ${isSelected ? 'text-white' : bid.is_prediction ? 'text-rose-700' : 'text-slate-800'}`}>
                                                                                    {bid.공고URL && !bid.is_prediction ? (
                                                                                        <a href={bid.공고URL} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:underline">
                                                                                            {bid.공고명}
                                                                                        </a>
                                                                                    ) : bid.공고명}
                                                                                </p>
                                                                            </div>

                                                                            {isSelected ? (
                                                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="pt-3 mt-3 border-t border-white/20 space-y-2.5">
                                                                                    <div className="flex justify-between items-center text-[10px]">
                                                                                        <span className="text-white/60 font-bold uppercase tracking-wider">실수요기관</span>
                                                                                        <span className="text-white font-black truncate max-w-[150px]">{bid.실수요기관}</span>
                                                                                    </div>
                                                                                    <div className="flex justify-between items-center text-[10px]">
                                                                                        <span className="text-white/60 font-bold uppercase tracking-wider">{bid.is_prediction ? '예측일' : '입찰일시'}</span>
                                                                                        <span className="text-white font-black">{bid.예상_입찰일 || bid.예상_년월}</span>
                                                                                    </div>
                                                                                    <div className="flex justify-between items-center text-[10px]">
                                                                                        <span className="text-white/60 font-bold uppercase tracking-wider">사업금액</span>
                                                                                        <span className="text-white font-black">{bid['계약 기간 내'] > 0 ? `₩${formatAmount(bid['계약 기간 내'])}` : '-'}</span>
                                                                                    </div>
                                                                                    {bid['용역기간(개월)'] > 0 && (
                                                                                        <div className="flex justify-between items-center text-[10px]">
                                                                                            <span className="text-white/60 font-bold uppercase tracking-wider">용역기간</span>
                                                                                            <span className="text-white font-black">{bid['용역기간(개월)']}개월</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {bid.입찰결과_1순위 && (
                                                                                        <div className="flex justify-between items-center text-[10px] pt-1.5 border-t border-white/10">
                                                                                            <span className="text-white/60 font-bold uppercase tracking-wider">낙찰업체</span>
                                                                                            <span className="text-white font-black truncate max-w-[120px]">{bid.입찰결과_1순위}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {bid.입찰금액_1순위 > 0 && (
                                                                                        <div className="flex justify-between items-center text-[10px]">
                                                                                            <span className="text-white/60 font-bold uppercase tracking-wider">낙찰금액</span>
                                                                                            <span className="text-white font-black">₩{formatAmount(bid.입찰금액_1순위)}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {!bid.is_prediction && (
                                                                                        <button
                                                                                            onClick={(e) => { e.stopPropagation(); handleEdit(bid); }}
                                                                                            className="w-full mt-2 py-1.5 bg-white/20 text-white text-[10px] font-bold rounded-lg hover:bg-white/30 transition-all flex items-center justify-center gap-1"
                                                                                        >
                                                                                            <Edit2 size={10} /> 용역기간 입력
                                                                                        </button>
                                                                                    )}
                                                                                </motion.div>
                                                                            ) : (
                                                                                <div className="flex items-center justify-between">
                                                                                    <span className="text-[10px] text-slate-400 truncate max-w-[100px]">{bid.실수요기관}</span>
                                                                                    {bid.is_prediction ? (
                                                                                        <span className="text-[9px] font-black text-rose-400 bg-rose-50 px-1.5 py-0.5 rounded">예측</span>
                                                                                    ) : (
                                                                                        <span className="text-[10px] font-black text-blue-600">{bid['계약 기간 내'] > 0 ? formatAmount(bid['계약 기간 내']) : ''}</span>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )
                                                                })
                                                            ) : (
                                                                <div className="h-full flex items-center justify-center text-slate-300 text-xs italic">데이터 없음</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                /* Full Data Table - Announcement List View */
                                (() => {
                                    const filteredBids = yearData.filter(b =>
                                        !searchQuery || b.공고명.includes(searchQuery) || b.실수요기관.includes(searchQuery)
                                    );
                                    return (
                                        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                                            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                                                <div className="flex items-center gap-3">
                                                    <h3 className="font-bold text-lg">전체 입찰 공고 목록</h3>
                                                    <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-bold">
                                                        {filteredBids.length}건
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4 bg-white border border-slate-200 px-4 py-2 rounded-xl w-72">
                                                    <Search size={16} className="text-slate-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="공고명, 기관명 검색..."
                                                        value={searchQuery}
                                                        onChange={(e) => setSearchQuery(e.target.value)}
                                                        className="bg-transparent border-none outline-none text-xs w-full"
                                                    />
                                                </div>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left border-collapse">
                                                    <thead className="bg-slate-50">
                                                        <tr>
                                                            <th className="px-8 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">공고명 / 기관</th>
                                                            <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">사업금액</th>
                                                            <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center">용역기간</th>
                                                            <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center">낙찰업체</th>
                                                            <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">예상월</th>
                                                            <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center">구분</th>
                                                            <th className="px-6 py-5 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-center"></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                        {filteredBids.map((bid) => (
                                                            <tr key={bid.bid_id} className={`hover:bg-slate-50/80 transition-all ${bid.is_prediction ? 'bg-rose-50/30' : ''}`}>
                                                                <td className="px-8 py-5">
                                                                    {bid.공고URL && !bid.is_prediction ? (
                                                                        <a
                                                                            href={bid.공고URL}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className={`font-bold text-sm line-clamp-1 hover:underline hover:text-blue-600 transition-colors ${bid.is_prediction ? 'text-rose-600' : 'text-slate-700'}`}
                                                                        >
                                                                            {bid.공고명}
                                                                        </a>
                                                                    ) : (
                                                                        <p className={`font-bold text-sm line-clamp-1 ${bid.is_prediction ? 'text-rose-600' : 'text-slate-700'}`}>{bid.공고명}</p>
                                                                    )}
                                                                    <p className="text-xs text-slate-400 mt-0.5">{bid.실수요기관}</p>
                                                                </td>
                                                                <td className="px-6 py-5 text-right font-bold text-sm text-slate-600 tabular-nums whitespace-nowrap">
                                                                    {bid['계약 기간 내'] > 0 ? formatAmount(bid['계약 기간 내']) : '-'}
                                                                </td>
                                                                <td className="px-6 py-5 text-center font-bold text-sm text-slate-600">
                                                                    {bid['용역기간(개월)'] > 0 ? `${bid['용역기간(개월)']}개월` : '-'}
                                                                </td>
                                                                <td className="px-6 py-5 text-center text-sm text-slate-600 max-w-[180px] truncate">
                                                                    {bid.입찰결과_1순위 || '-'}
                                                                </td>
                                                                <td className="px-6 py-5 text-right font-bold text-sm text-slate-600 tabular-nums">{bid.예상_입찰월}월</td>
                                                                <td className="px-6 py-5 text-center">
                                                                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${bid.is_prediction ? 'bg-rose-50 text-rose-500' : 'bg-blue-50 text-blue-500'}`}>
                                                                        {bid.is_prediction ? `${bid.prediction_count}차 Pred` : 'Actual'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-5 text-center">
                                                                    {!bid.is_prediction && (
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); handleEdit(bid); }}
                                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-500 text-xs font-bold rounded-xl hover:bg-blue-600 hover:text-white transition-all border border-slate-100"
                                                                        >
                                                                            <Edit2 size={12} />
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })()
                            )}
                        </div>
                    )}
                </main>

                {/* 용역기간 편집 모달 */}
                <AnimatePresence>
                    {editingBid && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingBid(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" />
                            <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden border border-white/20">
                                <div className="p-10">
                                    <div className="flex items-center justify-between mb-8">
                                        <h3 className="text-2xl font-black tracking-tight">용역기간 입력</h3>
                                        <button onClick={() => setEditingBid(null)} className="p-3 hover:bg-slate-100 rounded-full transition-all text-slate-400"><X size={24} /></button>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-2">대상 공고</label>
                                            <p className="font-bold text-slate-800 leading-snug text-lg">{editingBid.공고명}</p>
                                            <p className="text-sm text-slate-400 mt-2 flex items-center gap-1.5"><Calendar size={14} /> {editingBid.실수요기관}</p>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">용역기간 (개월)</label>
                                            <input
                                                type="number"
                                                value={editDuration}
                                                onChange={(e) => setEditDuration(Number(e.target.value))}
                                                className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold text-slate-800 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all text-xl"
                                                placeholder="예: 12"
                                                min={0}
                                            />
                                            <p className="text-[11px] text-slate-400 pl-1">
                                                용역기간을 입력하면 해당 주기로 차기 입찰을 최대 3차까지 자동 예측합니다.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-10 flex gap-4">
                                        <button onClick={() => setEditingBid(null)} className="flex-1 px-8 py-5 bg-slate-100 text-slate-500 font-bold rounded-2xl hover:bg-slate-200 transition-all">취소</button>
                                        <button onClick={handleSave} className="flex-[2] px-8 py-5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 transition-all"><Save size={20} /> 저장</button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* Collection Status Modal */}
                {showCollectionModal && (
                    <CollectionStatusModal onClose={() => setShowCollectionModal(false)} />
                )}
            </div>
        </div>
    )
}

export default App
