import { db, ref, set, get } from '../api/firebase';

// 공고를 목록에서 제외(숨김) 처리. /bids 원본은 그대로 두고 /hidden_bids 에 기록하여
// 재수집되어도 계속 숨김 상태가 유지되도록 한다.
export const deleteBid = async (bidId: string, 공고명 = '') => {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    await set(ref(db, `/hidden_bids/${bidId}`), { hidden: true, 공고명, hiddenAt: now });
};

// 제외 해제(복원)
export const restoreBid = async (bidId: string) => {
    await set(ref(db, `/hidden_bids/${bidId}`), null);
};

export const updateServiceDuration = async (bidId: string, duration: number) => {
    const userRef = ref(db, `/user_inputs/${bidId}`);

    const existing = await get(userRef);
    const currentData = existing.val() || {};

    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);

    await set(userRef, {
        ...currentData,
        '용역기간(개월)': duration,
        '마지막_수정일': timestamp,
        '수정자': 'dashboard_user'
    });
};
