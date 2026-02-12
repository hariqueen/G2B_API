import { useState, useEffect } from 'react';
import { Bid } from '../types';

export const useFirestoreBids = () => {
    const [bids, setBids] = useState<Bid[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const fetchBids = async () => {
            try {
                const response = await fetch('/api/firestore/bids');
                if (!response.ok) {
                    throw new Error(`API error: ${response.status}`);
                }

                const data = await response.json();

                const rows: Bid[] = data.map((doc: any) => {
                    // 날짜 파싱
                    let bidDateStr = doc.bidNtceDt || '';
                    if (bidDateStr.includes(' ') && !bidDateStr.includes('T')) {
                        bidDateStr = bidDateStr.replace(' ', 'T');
                    }
                    const bidDate = new Date(bidDateStr);
                    const year = bidDate.getFullYear();
                    const month = bidDate.getMonth() + 1;

                    return {
                        bid_id: doc.id,
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
                });

                setBids(rows);
                setLoading(false);
            } catch (err) {
                console.error('Error fetching bids from API:', err);
                setError(err as Error);
                setLoading(false);
            }
        };

        fetchBids();
    }, []);

    return { bids, loading, error };
};
