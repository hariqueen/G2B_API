import { useState, useEffect } from 'react';
import { db, ref, onValue } from '../api/firebase';
import { Bid } from '../types';

/**
 * AX 입찰공고를 RTDB(/ax_bids)에서 직접 읽는다.
 *
 * 전에는 서버의 /api/firestore/bids 를 거쳐 Firestore 에서 읽었다.
 * Firestore 는 문서 읽기 건수로 과금해 컬렉션을 훑을 때마다 문서 수만큼
 * read 가 나갔고 무료 한도를 소진시켰다. RTDB 는 전송량 과금이라 이 데이터
 * (0.3MB 수준)는 부담이 없고, 서버를 거칠 이유도 사라졌다.
 *
 * 훅 이름은 호출부 영향을 줄이려 그대로 둔다.
 */
const AX_PATH = '/ax_bids';

const toBid = (id: string, doc: any): Bid => {
    let bidDateStr = doc.bidNtceDt || '';
    if (bidDateStr.includes(' ') && !bidDateStr.includes('T')) {
        bidDateStr = bidDateStr.replace(' ', 'T');
    }
    const bidDate = new Date(bidDateStr);
    const year = bidDate.getFullYear();
    const month = bidDate.getMonth() + 1;

    return {
        bid_id: id,
        공고명: doc.bidNtceNm || '제목 없음',
        실수요기관: doc.dminsttNm || doc.ntceInsttNm || '기관명 없음',
        공고URL: doc.bidNtceUrl || doc.stdNtceDocUrl || '',
        '물동량 평균': 0,
        '용역기간(개월)': 0,
        '계약 기간 내': parseInt(doc.asignBdgtAmt || '0'),
        입찰결과_1순위: doc.sucsfbidMthdNm || '진행중',
        입찰금액_1순위: parseInt(doc.asignBdgtAmt || '0'),
        예상_입찰일: bidDateStr,
        예상_연도: isNaN(year) ? new Date().getFullYear() : year,
        예상_입찰월: isNaN(month) ? new Date().getMonth() + 1 : month,
        예상_년월: isNaN(year) ? '' : `${year}-${String(month).padStart(2, '0')}`,
        is_prediction: false,

        // BidFinder 전용 필드
        reNtceYn: doc.reNtceYn || 'N',
        bidClseDt: doc.bidClseDt || '',
        bidBeginDt: doc.bidBeginDt || '',
        ntceInsttNm: doc.ntceInsttNm || '',
        ntceInsttOfclNm: doc.ntceInsttOfclNm || '',
        ntceInsttOfclTelNo: doc.ntceInsttOfclTelNo || '',
        presmptPrce: parseInt(doc.presmptPrce || '0'),
        asignBdgtAmt: parseInt(doc.asignBdgtAmt || '0'),
        ...doc
    } as Bid;
};

export const useFirestoreBids = () => {
    const [bids, setBids] = useState<Bid[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const off = onValue(
            ref(db, AX_PATH),
            snap => {
                const node = snap.val() || {};
                const rows = Object.entries(node)
                    .map(([id, v]) => toBid(id, v))
                    // 공고일시 최신순
                    .sort((a, b) => String(b.bidNtceDt || '').localeCompare(String(a.bidNtceDt || '')));
                setBids(rows);
                setLoading(false);
            },
            err => {
                console.error('Error reading AX bids from RTDB:', err);
                setError(err as Error);
                setLoading(false);
            }
        );
        return () => off();
    }, []);

    return { bids, loading, error };
};
