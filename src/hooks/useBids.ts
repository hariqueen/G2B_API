import { useState, useEffect } from 'react';
import { db, ref, onValue } from '../api/firebase';
import { Bid } from '../types';

/** 사업명에서 연도·차수·괄호 수식어를 걷어내 같은 사업끼리 묶이게 한다. */
export const canonicalName = (name: string) =>
    String(name || '')
        .replace(/20\d{2}\s*년도?/g, '')
        .replace(/['‘’]\d{2}\s*년도?/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/\d+차/g, '')
        .replace(/[\s\-_()[\]·,]/g, '');

const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/**
 * 같은 사업의 과거 공고 간격으로 재입찰 주기(개월)를 추정한다.
 *
 * 2개월 이내 연속 건은 재공고로 보고 하나로 합친다. 이 병합이 없으면
 * 최빈 간격이 1개월로 잡혀 재공고를 연간 주기로 오인한다.
 */
export const deriveCycles = (rows: Bid[]): Map<string, number> => {
    const groups = new Map<string, number[]>();

    rows.forEach(b => {
        const t = new Date(b.예상_입찰일).getTime();
        if (isNaN(t)) return;
        const key = canonicalName(b.공고명);
        if (!key) return;
        const arr = groups.get(key) || [];
        arr.push(t);
        groups.set(key, arr);
    });

    const out = new Map<string, number>();
    groups.forEach((times, key) => {
        const sorted = [...times].sort((a, b) => a - b).map(t => new Date(t));

        // 재공고 병합: 직전 이벤트와 2개월 이내면 같은 건으로 본다
        const events: Date[] = [];
        sorted.forEach(d => {
            const prev = events[events.length - 1];
            const gap = prev
                ? (d.getFullYear() * 12 + d.getMonth()) - (prev.getFullYear() * 12 + prev.getMonth())
                : Infinity;
            if (gap > 2) events.push(d);
        });
        if (events.length < 2) return;

        const gaps: number[] = [];
        for (let i = 1; i < events.length; i++) {
            const g = (events[i].getFullYear() * 12 + events[i].getMonth())
                - (events[i - 1].getFullYear() * 12 + events[i - 1].getMonth());
            if (g >= 3 && g <= 48) gaps.push(g);   // 3개월 미만은 재공고 잔여로 본다
        }
        if (gaps.length) out.set(key, median(gaps));
    });

    return out;
};

export const useBids = () => {
    const [bids, setBids] = useState<Bid[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const bidsRef = ref(db, '/bids');
        const userInputsRef = ref(db, '/user_inputs');
        const hiddenRef = ref(db, '/hidden_bids');
        let bidsData: any = {};
        let userInputsData: any = {};
        let hiddenData: any = {};
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

                // 제외(숨김) 처리된 공고 필터링 (/hidden_bids) - 원본과 예측 모두 숨김
                const visibleRows = rows.filter(r => !hiddenData[r.bid_id]);

                // 용역기간 자동 유도.
                // 수동입력은 전체의 절반 수준이라 나머지는 예측이 아예 생성되지 않았다.
                // 같은 사업의 과거 공고 간격으로 주기를 추정해 채운다.
                // (실측: 재공고 병합 후 주기 중앙값 12개월, ±1이 59%)
                const derivedCycle = deriveCycles(visibleRows);

                // 예측 로직: 용역기간 기반으로 차기 입찰 예측
                const predictions: Bid[] = [];
                visibleRows.forEach(bid => {
                    if (bid.is_prediction) return;

                    const manual = bid['용역기간(개월)'];
                    const derived = derivedCycle.get(canonicalName(bid.공고명));
                    const serviceMonths = manual > 0 ? manual : (derived ?? 0);
                    const durationSource: Bid['_durationSource'] =
                        manual > 0 ? 'manual' : (derived ? 'derived' : 'none');

                    bid._durationSource = durationSource;
                    bid._effectiveDuration = serviceMonths;

                    if (serviceMonths > 0) {
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

                setBids([...visibleRows, ...predictions]);
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

        // /hidden_bids 실시간 리스너 (목록에서 제외한 공고)
        const unsubHidden = onValue(hiddenRef, (snapshot) => {
            hiddenData = snapshot.val() || {};
            buildBids();
        }, () => {
            // 규칙 미설정 등으로 읽기 실패 시 빈 값으로 처리 (전체 표시)
            hiddenData = {};
            buildBids();
        });

        return () => {
            unsubBids();
            unsubInputs();
            unsubHidden();
        };
    }, []);

    return { bids, loading, error };
};
