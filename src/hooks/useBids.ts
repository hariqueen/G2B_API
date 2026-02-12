import { useState, useEffect } from 'react';
import { db, ref, onValue } from '../api/firebase';
import { Bid } from '../types';

export const useBids = () => {
    const [bids, setBids] = useState<Bid[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const bidsRef = ref(db, '/bids');
        const userInputsRef = ref(db, '/user_inputs');
        let bidsData: any = {};
        let userInputsData: any = {};
        let bidsLoaded = false;

        const buildBids = () => {
            if (!bidsLoaded) return;

            try {
                const rows: Bid[] = [];

                // RTDB 구조: /bids/{year}/{month}/{bid_id}
                Object.entries(bidsData).forEach(([year, months]: [string, any]) => {
                    if (!months || typeof months !== 'object') return;

                    Object.entries(months).forEach(([month, bidEntries]: [string, any]) => {
                        if (!bidEntries || typeof bidEntries !== 'object') return;

                        Object.entries(bidEntries).forEach(([bidId, data]: [string, any]) => {
                            if (!data || typeof data !== 'object') return;

                            const yearNum = parseInt(year);
                            const monthNum = parseInt(month);

                            const row: Bid = {
                                bid_id: bidId,
                                공고명: data.공고명 || '제목 없음',
                                실수요기관: data.채권자명 || '기관명 없음',
                                공고URL: data.입찰공고URL || '',
                                '물동량 평균': 0,
                                '용역기간(개월)': 0,
                                '계약 기간 내': Number(data.사업금액) || 0,
                                입찰결과_1순위: data.개찰업체정보 || '',
                                입찰금액_1순위: Number(data.낙찰금액) || 0,
                                유찰사유: data.유찰사유 || '',
                                예상_입찰일: data.입찰일시 || `${year}-${month.padStart(2, '0')}-01`,
                                예상_연도: isNaN(yearNum) ? new Date().getFullYear() : yearNum,
                                예상_입찰월: isNaN(monthNum) ? 1 : monthNum,
                                예상_년월: `${year}-${String(monthNum).padStart(2, '0')}`,
                                is_prediction: false
                            };

                            // user_inputs에서 용역기간 병합
                            if (userInputsData[bidId]) {
                                const userInput = userInputsData[bidId];
                                row['용역기간(개월)'] = Number(userInput['용역기간(개월)']) || 0;
                            }

                            rows.push(row);
                        });
                    });
                });

                // 예측 로직: 용역기간 기반으로 차기 입찰 예측
                const predictions: Bid[] = [];
                rows.forEach(bid => {
                    if (bid['용역기간(개월)'] > 0 && !bid.is_prediction) {
                        const serviceMonths = bid['용역기간(개월)'];
                        let currentDate = new Date(bid.예상_입찰일);
                        if (isNaN(currentDate.getTime())) {
                            currentDate = new Date(`${bid.예상_연도}-${String(bid.예상_입찰월).padStart(2, '0')}-01`);
                        }

                        for (let i = 1; i <= 3; i++) {
                            const predDate = new Date(currentDate);
                            predDate.setMonth(predDate.getMonth() + serviceMonths * i);

                            const predYear = predDate.getFullYear();
                            const predMonth = predDate.getMonth() + 1;

                            predictions.push({
                                ...bid,
                                bid_id: `${bid.bid_id}_pred_${i}`,
                                공고명: `${bid.공고명} (${i}차 예측)`,
                                예상_연도: predYear,
                                예상_입찰월: predMonth,
                                예상_년월: `${predYear}-${String(predMonth).padStart(2, '0')}`,
                                is_prediction: true,
                                prediction_count: i,
                                입찰결과_1순위: '',
                                입찰금액_1순위: 0,
                                예상_입찰일: predDate.toISOString().split('T')[0]
                            });
                        }
                    }
                });

                setBids([...rows, ...predictions]);
                setLoading(false);
            } catch (err) {
                console.error('Error building bids:', err);
                setError(err as Error);
                setLoading(false);
            }
        };

        // /bids 실시간 리스너
        const unsubBids = onValue(bidsRef, (snapshot) => {
            bidsData = snapshot.val() || {};
            bidsLoaded = true;
            buildBids();
        }, (err) => {
            console.error('Error listening to /bids:', err);
            setError(err);
            setLoading(false);
        });

        // /user_inputs 실시간 리스너 (용역기간 데이터)
        const unsubInputs = onValue(userInputsRef, (snapshot) => {
            userInputsData = snapshot.val() || {};
            buildBids();
        });

        return () => {
            unsubBids();
            unsubInputs();
        };
    }, []);

    return { bids, loading, error };
};
