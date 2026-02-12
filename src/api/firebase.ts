import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase, ref, onValue, set, get } from "firebase/database";

// G2B Dashboard (Realtime DB) Config - 콜센터 운영 위탁용
const rtdbConfig = {
    databaseURL: import.meta.env.VITE_RTDB_DATABASE_URL || "https://g2b-db-6aae9-default-rtdb.asia-southeast1.firebasedatabase.app/"
};

// Initialize RTDB App
let rtdbApp;

if (!getApps().length) {
    rtdbApp = initializeApp(rtdbConfig, "rtdbApp");
} else {
    try {
        rtdbApp = getApp("rtdbApp");
    } catch (e) {
        rtdbApp = initializeApp(rtdbConfig, "rtdbApp");
    }
}

export const db = getDatabase(rtdbApp);
export { ref, onValue, set, get };
