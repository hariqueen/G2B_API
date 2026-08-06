import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';

/**
 * 공고 리스트와 사전규격 리스트가 공유하는 표 UI.
 *
 * 두 화면이 같은 모양이어야 하는데 마크업을 각자 들고 있으면 손볼 때마다
 * 어긋난다. 껍데기·탭·페이지네이션처럼 완전히 겹치는 부분만 여기로 모은다.
 */

/** 카드 껍데기. 테두리 대신 옅은 ring + 번지는 그림자로 띄운다. */
export const CARD =
    'bg-white rounded-2xl ring-1 ring-slate-900/[0.06] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.16)] overflow-hidden';

/**
 * 표 헤더 셀. uppercase·tracking-widest 는 한글에서 효과가 없고
 * 글자 사이만 벌려 열 폭을 밀어내므로 쓰지 않는다.
 */
const TH_BASE =
    'py-3 text-[11px] font-semibold text-slate-400 whitespace-nowrap';
export const TH = `px-6 ${TH_BASE}`;
export const TH_FIRST = `px-6 sm:px-7 ${TH_BASE}`;
export const TH_C = `${TH} text-center`;
export const TH_R = `${TH} text-right`;

/** 표 헤더 행. 스크롤해도 열 이름이 남도록 고정한다. */
export const THEAD =
    'sticky top-0 z-10 bg-slate-50/80 backdrop-blur-sm border-b border-slate-100';

export const TBODY = 'divide-y divide-slate-100/80';
export const TR = 'group hover:bg-slate-50/70 transition-colors';
export const TD = 'px-6 py-3';
export const TD_FIRST = 'px-6 sm:px-7 py-3';

/** 옅은 배경 + 같은 색 얇은 테두리. 꽉 찬 색보다 표 위에서 덜 튄다. */
export const badge = (tone: 'blue' | 'violet' | 'emerald' | 'amber' | 'rose' | 'slate' | 'red') => {
    const tones: Record<string, string> = {
        blue: 'bg-blue-50 text-blue-600 ring-blue-600/15',
        violet: 'bg-violet-50 text-violet-600 ring-violet-600/15',
        emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-600/15',
        amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
        rose: 'bg-rose-50 text-rose-600 ring-rose-600/15',
        slate: 'bg-slate-100 text-slate-500 ring-slate-500/10',
        red: 'bg-red-600 text-white ring-red-700/20'
    };
    return `inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ring-1 whitespace-nowrap ${tones[tone]}`;
};

/** 아이콘만 있는 링크 버튼. 표 안에서 칩보다 자리를 훨씬 덜 먹는다. */
export const iconLink = (tone: 'slate' | 'blue') =>
    'inline-flex items-center justify-center w-7 h-7 rounded-lg ring-1 transition-all ' +
    (tone === 'blue'
        ? 'bg-blue-50 text-blue-500 ring-blue-600/10 hover:bg-blue-600 hover:text-white hover:ring-blue-600'
        : 'bg-slate-50 text-slate-400 ring-slate-900/[0.06] hover:bg-slate-700 hover:text-white hover:ring-slate-700');

/**
 * 라벨이 붙은 드롭다운 필터. 선택지마다 건수를 함께 보여준다 —
 * 버튼을 늘어놓을 때 보이던 건수를 드롭다운으로 바꾸면서 잃지 않기 위함이다.
 *
 * 기본 select 를 쓴다. 직접 만든 목록보다 키보드·모바일 동작이 낫다.
 */
export const FilterSelect = <T extends string>({ label, value, onChange, options }: {
    label: string;
    value: T;
    onChange: (v: T) => void;
    options: { key: T; label: string; n?: number }[];
}) => (
    <div className="inline-flex items-center gap-2 h-9 pl-3 pr-2 bg-slate-100 rounded-xl ring-1 ring-transparent transition-all focus-within:bg-white focus-within:ring-blue-500/30 focus-within:shadow-sm">
        <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">{label}</span>
        <div className="relative flex items-center">
            <select
                value={value}
                onChange={(e) => onChange(e.target.value as T)}
                className="appearance-none bg-transparent pr-5 text-xs font-bold text-slate-700 outline-none cursor-pointer"
            >
                {options.map(o => (
                    <option key={o.key} value={o.key}>
                        {o.label}{o.n !== undefined ? ` (${o.n})` : ''}
                    </option>
                ))}
            </select>
            <ChevronDown size={13} className="absolute right-0 text-slate-400 pointer-events-none" />
        </div>
    </div>
);

export const SearchBox = ({ value, onChange, placeholder }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
}) => (
    <div className="flex items-center gap-2 bg-slate-100 px-3.5 py-2 rounded-xl w-64 ring-1 ring-transparent transition-all focus-within:bg-white focus-within:ring-blue-500/30 focus-within:shadow-sm">
        <Search size={15} className="text-slate-400 shrink-0" />
        <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="bg-transparent border-none outline-none text-xs font-medium text-slate-700 placeholder:text-slate-400 w-full"
        />
    </div>
);

export const PageSizeSelect = ({ value, onChange }: {
    value: number;
    onChange: (v: number) => void;
}) => (
    <FilterSelect
        label="표시"
        value={String(value)}
        onChange={(v) => onChange(Number(v))}
        options={[10, 30, 50, 100].map(n => ({ key: String(n), label: `${n}개씩` }))}
    />
);

/**
 * 페이지네이션 푸터. 현재 페이지 기준 최대 5개 창으로 번호를 보여준다.
 * page 는 이미 범위 안으로 보정된 값이 들어온다고 본다.
 */
export const Pagination = ({ total, page, pageSize, totalPages, onPage }: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    onPage: (p: number) => void;
}) => {
    const startIdx = (page - 1) * pageSize;
    const shown = Math.min(pageSize, total - startIdx);
    const winStart = Math.max(1, Math.min(page - 2, totalPages - 4));
    const pageNums = Array.from({ length: Math.min(5, totalPages) }, (_, i) => winStart + i);

    const navBtn =
        'p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all';

    return (
        <div className="px-6 sm:px-7 py-3.5 border-t border-slate-100 flex items-center gap-4">
            <p className="flex-1 text-xs font-medium text-slate-400 tabular-nums">
                총 <span className="font-bold text-slate-600">{total}</span>건 중 {startIdx + 1}–{startIdx + shown}
            </p>

            <div className="flex items-center gap-0.5">
                <button onClick={() => onPage(page - 1)} disabled={page === 1} className={navBtn} title="이전 페이지">
                    <ChevronLeft size={15} />
                </button>

                {winStart > 1 && <span className="px-1 text-xs font-bold text-slate-300">…</span>}

                {pageNums.map(p => (
                    <button
                        key={p}
                        onClick={() => onPage(p)}
                        className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold tabular-nums transition-all ${p === page
                            ? 'bg-slate-800 text-white shadow-sm'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
                    >
                        {p}
                    </button>
                ))}

                {winStart + pageNums.length - 1 < totalPages && (
                    <span className="px-1 text-xs font-bold text-slate-300">…</span>
                )}

                <button onClick={() => onPage(page + 1)} disabled={page === totalPages} className={navBtn} title="다음 페이지">
                    <ChevronRight size={15} />
                </button>
            </div>

            {/* 좌측 건수 텍스트와 폭을 맞춰 네비게이션을 가운데에 둔다 */}
            <div className="flex-1" />
        </div>
    );
};
