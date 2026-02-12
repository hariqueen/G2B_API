import { db, ref, set, get } from '../api/firebase';

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
