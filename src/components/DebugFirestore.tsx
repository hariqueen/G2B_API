import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, getDoc, doc } from 'firebase/firestore';
import { firestore } from '../api/firebase';

const DebugFirestore = () => {
    const [logs, setLogs] = useState<string[]>([]);
    const [data, setData] = useState<any>(null);
    const [configCheck, setConfigCheck] = useState<any>(null);

    const addLog = (msg: string) => setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);

    useEffect(() => {
        const runTest = async () => {
            try {
                // 1. Check Config
                const apiKey = import.meta.env.VITE_FIRESTORE_API_KEY;
                const projectId = import.meta.env.VITE_FIRESTORE_PROJECT_ID;

                setConfigCheck({
                    apiKeyStart: apiKey ? `${apiKey.substring(0, 5)}...` : 'MISSING',
                    projectId: projectId || 'MISSING (Default: g2b-bid-finder)',
                });

                if (!apiKey) {
                    addLog("CRITICAL: API Key is missing. Check .env file.");
                    return;
                }

                addLog("Connecting to Firestore...");

                // 2. Query Collection
                const listRef = collection(firestore, 'bid_pblanc_list');
                const q = query(listRef, limit(5));
                const snapshot = await getDocs(q);

                addLog(`Query Success! Found ${snapshot.size} documents.`);

                if (!snapshot.empty) {
                    const sampleDocs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    setData(sampleDocs);
                    addLog(`First Document ID: ${sampleDocs[0].id}`);
                } else {
                    addLog("Collection seems empty.");
                }

                // 3. Check Specific ID from User Request
                const specificId = "R25BK01017312-000"; // Example from user
                addLog(`Checking specific ID: ${specificId}...`);
                const docRef = doc(firestore, 'bid_pblanc_list', specificId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    addLog("Specific ID Found!");
                    console.log("Specific Doc:", docSnap.data());
                } else {
                    addLog("Specific ID NOT Found.");
                }

            } catch (err: any) {
                addLog(`ERROR: ${err.message}`);
                console.error(err);
            }
        };

        runTest();
    }, []);

    return (
        <div className="bg-yellow-50 border-b-4 border-yellow-400 p-4 font-mono text-xs text-slate-800 overflow-auto max-h-96">
            <h3 className="font-bold text-lg mb-2">🔥 Firestore Connection Test</h3>

            <div className="mb-4 p-2 bg-yellow-100 rounded">
                <strong>Config Check:</strong>
                <pre>{JSON.stringify(configCheck, null, 2)}</pre>
            </div>

            <div className="mb-4">
                <strong>Logs:</strong>
                <ul className="list-disc pl-5">
                    {logs.map((log, i) => <li key={i}>{log}</li>)}
                </ul>
            </div>

            {data && (
                <div>
                    <strong>Sample Data (First 5):</strong>
                    <pre className="mt-2 p-2 bg-slate-800 text-green-400 rounded overflow-auto">
                        {JSON.stringify(data, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
};

export default DebugFirestore;
