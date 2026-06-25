import { useState, useEffect } from 'react'
import { ref, onValue, push, update, remove } from 'firebase/database'
import { db } from '../api/firebase'
import { Mail, Plus, Trash2, Pencil, Check, X, BellRing, Power } from 'lucide-react'

interface Recipient {
    id: string
    email: string
    name: string
    enabled: boolean
    addedAt: number
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SettingsPanel() {
    const [recipients, setRecipients] = useState<Recipient[]>([])
    const [loading, setLoading] = useState(true)

    const [newEmail, setNewEmail] = useState('')
    const [newName, setNewName] = useState('')
    const [error, setError] = useState('')

    const [editingId, setEditingId] = useState<string | null>(null)
    const [editEmail, setEditEmail] = useState('')
    const [editName, setEditName] = useState('')

    useEffect(() => {
        const r = ref(db, 'notification_emails')
        const unsub = onValue(r, (snap) => {
            const val = snap.val() || {}
            const list: Recipient[] = Object.entries(val).map(([id, v]) => {
                const item = v as Partial<Recipient>
                return {
                    id,
                    email: item.email || '',
                    name: item.name || '',
                    enabled: item.enabled !== false,
                    addedAt: item.addedAt || 0,
                }
            })
            list.sort((a, b) => a.addedAt - b.addedAt)
            setRecipients(list)
            setLoading(false)
        })
        return () => unsub()
    }, [])

    const addRecipient = async () => {
        const email = newEmail.trim()
        if (!EMAIL_RE.test(email)) {
            setError('올바른 이메일 형식이 아닙니다.')
            return
        }
        if (recipients.some((r) => r.email.toLowerCase() === email.toLowerCase())) {
            setError('이미 등록된 이메일입니다.')
            return
        }
        setError('')
        await push(ref(db, 'notification_emails'), {
            email,
            name: newName.trim(),
            enabled: true,
            addedAt: Date.now(),
        })
        setNewEmail('')
        setNewName('')
    }

    const toggleEnabled = async (r: Recipient) => {
        await update(ref(db, `notification_emails/${r.id}`), { enabled: !r.enabled })
    }

    const deleteRecipient = async (r: Recipient) => {
        if (!window.confirm(`'${r.email}' 을(를) 알림 목록에서 삭제할까요?`)) return
        await remove(ref(db, `notification_emails/${r.id}`))
    }

    const startEdit = (r: Recipient) => {
        setEditingId(r.id)
        setEditEmail(r.email)
        setEditName(r.name)
        setError('')
    }

    const cancelEdit = () => {
        setEditingId(null)
        setError('')
    }

    const saveEdit = async (r: Recipient) => {
        const email = editEmail.trim()
        if (!EMAIL_RE.test(email)) {
            setError('올바른 이메일 형식이 아닙니다.')
            return
        }
        if (recipients.some((x) => x.id !== r.id && x.email.toLowerCase() === email.toLowerCase())) {
            setError('이미 등록된 이메일입니다.')
            return
        }
        await update(ref(db, `notification_emails/${r.id}`), { email, name: editName.trim() })
        setEditingId(null)
        setError('')
    }

    const enabledCount = recipients.filter((r) => r.enabled).length

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            {/* 헤더 */}
            <div className="bg-white rounded-[24px] border border-slate-100 p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <BellRing size={20} className="text-white" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800">수집 알림 메일 설정</h3>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed">
                    매일 아침 수집 결과(콜센터 · AX) 메일을 받을 수신자를 관리합니다.
                    여기에 등록된 <span className="font-bold text-blue-600">{enabledCount}명</span>에게
                    매일 자동으로 발송됩니다. (켜짐 상태인 주소만 발송)
                </p>
            </div>

            {/* 추가 폼 */}
            <div className="bg-white rounded-[24px] border border-slate-100 p-8 shadow-sm">
                <h4 className="text-sm font-bold text-slate-700 mb-4">새 수신자 추가</h4>
                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="이름 (선택)"
                        className="sm:w-40 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <div className="flex-1 relative">
                        <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addRecipient()}
                            placeholder="example@meta-m.co.kr"
                            className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <button
                        onClick={addRecipient}
                        className="px-6 py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
                    >
                        <Plus size={16} />
                        추가
                    </button>
                </div>
                {error && <p className="text-rose-500 text-xs font-semibold mt-3">{error}</p>}
            </div>

            {/* 목록 */}
            <div className="bg-white rounded-[24px] border border-slate-100 p-8 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                    <h4 className="text-sm font-bold text-slate-700">수신자 목록</h4>
                    <span className="text-xs font-bold text-slate-400">총 {recipients.length}명</span>
                </div>

                {loading ? (
                    <p className="text-sm text-slate-400 py-8 text-center">불러오는 중...</p>
                ) : recipients.length === 0 ? (
                    <div className="py-12 text-center">
                        <Mail size={32} className="mx-auto text-slate-300 mb-3" />
                        <p className="text-sm text-slate-400">등록된 수신자가 없습니다. 위에서 이메일을 추가해 주세요.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {recipients.map((r) => (
                            <div
                                key={r.id}
                                className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${r.enabled ? 'border-slate-100 bg-slate-50/50' : 'border-slate-100 bg-slate-50 opacity-60'}`}
                            >
                                {editingId === r.id ? (
                                    <>
                                        <input
                                            type="text"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            placeholder="이름"
                                            className="w-32 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <input
                                            type="email"
                                            value={editEmail}
                                            onChange={(e) => setEditEmail(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && saveEdit(r)}
                                            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        <button onClick={() => saveEdit(r)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="저장">
                                            <Check size={18} />
                                        </button>
                                        <button onClick={cancelEdit} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-all" title="취소">
                                            <X size={18} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                {r.name && <span className="text-sm font-bold text-slate-700">{r.name}</span>}
                                                <span className="text-sm text-slate-500 truncate">{r.email}</span>
                                            </div>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${r.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                                            {r.enabled ? '발송 중' : '꺼짐'}
                                        </span>
                                        <button onClick={() => toggleEnabled(r)} className={`p-2 rounded-lg transition-all ${r.enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`} title={r.enabled ? '발송 끄기' : '발송 켜기'}>
                                            <Power size={16} />
                                        </button>
                                        <button onClick={() => startEdit(r)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="수정">
                                            <Pencil size={16} />
                                        </button>
                                        <button onClick={() => deleteRecipient(r)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="삭제">
                                            <Trash2 size={16} />
                                        </button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
