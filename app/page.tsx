'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type WorkLog = {
  id: number
  user_name: string
  minutes: number | null
  created_at: string
  repme_code?: string | null
  start_time?: string | null
  end_time?: string | null
  type?: string | null
  memo?: string | null
  user_id?: string | null
  task_id?: number | null
}

type ScheduleTask = {
  id: number
  title?: string | null
  source_type?: string | null
  plan_type?: string | null
  start_time?: string | null
  end_time?: string | null
  scheduled_start_at?: string | null
  status?: string | null
  repme_code?: string | null
  target_minutes?: number | null
  logs?: WorkLog[]
}

type StartTaskRecord = {
  task_date: string
  target_minutes: number
}

const toUTC = (localStr: string): string => {
  const normalized = localStr.replace(/\//g, '-').replace(' ', 'T')
  return new Date(normalized + ':00+09:00').toISOString()
}

const calcMinutes = (startLocal: string, endLocal: string): number => {
  const diff = new Date(endLocal).getTime() - new Date(startLocal).getTime()
  return Math.max(0, Math.floor(diff / 60000))
}

function parseUTCString(timeStr: string): Date {
  if (timeStr.endsWith('Z')) return new Date(timeStr)
  if (timeStr.length > 10 && (timeStr.slice(10).includes('+') || timeStr.slice(10).includes('-'))) {
    return new Date(timeStr)
  }
  return new Date(timeStr.replace(' ', 'T') + 'Z')
}

const toLocalInputValue = (utcStr: string): string => {
  const d = parseUTCString(utcStr)
  const jstOffset = 9 * 60 * 60 * 1000
  const local = new Date(d.getTime() + jstOffset)
  return local.toISOString().slice(0, 16)
}

const jstOffset = 9 * 60 * 60 * 1000

function getJSTDateStr(date: Date): string {
  const jst = new Date(date.getTime() + jstOffset)
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`
}

export default function Home() {
  const [logs, setLogs] = useState<WorkLog[]>([])
  const [todayTasks, setTodayTasks] = useState<ScheduleTask[]>([])
  const [allTasks, setAllTasks] = useState<ScheduleTask[]>([])
  const [startTaskHistory, setStartTaskHistory] = useState<StartTaskRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [tasksLoading, setTasksLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [repmeCode, setRepmeCode] = useState('')
  const [password, setPassword] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [userId, setUserId] = useState('')

  const [manualMinutes, setManualMinutes] = useState('')
  const [manualMemo, setManualMemo] = useState('')
  const [savingManualLog, setSavingManualLog] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingStartTime, setEditingStartTime] = useState('')
  const [editingEndTime, setEditingEndTime] = useState('')
  const [editingMemo, setEditingMemo] = useState('')
  const [updatingLog, setUpdatingLog] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [showAllLogs, setShowAllLogs] = useState(false)

  const fetchLogs = useCallback(async () => {
    if (!isLoggedIn || !repmeCode) { setLogs([]); setLoading(false); return }
    setLoading(true)
    setMessage('')
    const { data, error } = await supabase
      .from('work_logs').select('*').eq('repme_code', repmeCode)
      .order('created_at', { ascending: false })
    if (error) { console.error(error); setMessage('取得失敗｜Fetch failed'); setLogs([]); setLoading(false); return }
    setLogs(data || [])
    setLoading(false)
  }, [isLoggedIn, repmeCode])

  const fetchTodayTasks = useCallback(async () => {
    if (!isLoggedIn || !repmeCode) { setTodayTasks([]); setTasksLoading(false); return }
    setTasksLoading(true)
    try {
      const nowJST = new Date(Date.now() + jstOffset)
      const todayStr = `${nowJST.getUTCFullYear()}-${String(nowJST.getUTCMonth() + 1).padStart(2, '0')}-${String(nowJST.getUTCDate()).padStart(2, '0')}`
      const todayStartUTC = new Date(todayStr + 'T00:00:00+09:00').toISOString()
      const todayEndUTC = new Date(todayStr + 'T23:59:59+09:00').toISOString()

      const { data: scheduleTasks, error: scheduleError } = await supabase
        .from('schedule_tasks')
        .select('id, title, source_type, plan_type, start_time, end_time, scheduled_start_at, status, repme_code, target_minutes')
        .eq('repme_code', repmeCode).eq('plan_type', 'schedule')
        .gte('scheduled_start_at', todayStartUTC)
        .lte('scheduled_start_at', todayEndUTC)
        .order('scheduled_start_at', { ascending: true })
      if (scheduleError) console.error(scheduleError)

      const { data: startTasks, error: startError } = await supabase
        .from('schedule_tasks')
        .select('id, title, source_type, plan_type, start_time, end_time, scheduled_start_at, status, repme_code, target_minutes')
        .eq('repme_code', repmeCode).eq('plan_type', 'start').eq('task_date', todayStr)
        .order('created_at', { ascending: true })
      if (startError) console.error(startError)

      const tasks = [...(startTasks || []), ...(scheduleTasks || [])]
      if (tasks.length === 0) { setTodayTasks([]); return }

      const taskIds = tasks.map((t) => t.id)
      const { data: taskLogs, error: logError } = await supabase
        .from('work_logs').select('id, task_id, start_time, end_time, minutes, type')
        .eq('repme_code', repmeCode).in('task_id', taskIds)
        .order('start_time', { ascending: true })
      if (logError) console.error(logError)

      setTodayTasks(tasks.map((task) => ({
        ...task,
        logs: (taskLogs as WorkLog[] || []).filter((log) => log.task_id === task.id),
      })))
    } catch (error) {
      console.error(error); setTodayTasks([])
    } finally {
      setTasksLoading(false)
    }
  }, [isLoggedIn, repmeCode])

  const fetchAllTasks = useCallback(async () => {
    if (!isLoggedIn || !repmeCode) { setAllTasks([]); return }
    const todayJST = new Date(Date.now() + jstOffset).toISOString().slice(0, 10)

    // Start Plan: 当日分をstatusに関わらず取得（completedでも表示する）
    const { data: startData, error: startError } = await supabase
      .from('schedule_tasks')
      .select('id, title, plan_type, source_type, scheduled_start_at, end_time, start_time, status, repme_code, target_minutes')
      .eq('repme_code', repmeCode)
      .eq('plan_type', 'start')
      .eq('task_date', todayJST)
    if (startError) console.error(startError)

    // Schedule Plan: 当日以降でplanned/in_progressのみ
    const { data: scheduleData, error: scheduleError } = await supabase
      .from('schedule_tasks')
      .select('id, title, plan_type, source_type, scheduled_start_at, end_time, start_time, status, repme_code, target_minutes')
      .eq('repme_code', repmeCode)
      .eq('plan_type', 'schedule')
      .gte('task_date', todayJST)
      .in('status', ['planned', 'in_progress'])
      .order('scheduled_start_at', { ascending: true })
    if (scheduleError) console.error(scheduleError)

    setAllTasks([...(startData || []), ...(scheduleData || [])])
  }, [isLoggedIn, repmeCode])

  // Start Plan履歴取得（達成連続日数の計算に使用）
  const fetchStartTaskHistory = useCallback(async () => {
    if (!isLoggedIn || !repmeCode) { setStartTaskHistory([]); return }
    const { data, error } = await supabase
      .from('schedule_tasks')
      .select('task_date, target_minutes')
      .eq('repme_code', repmeCode)
      .eq('plan_type', 'start')
      .order('task_date', { ascending: false })
    if (error) { console.error(error); setStartTaskHistory([]); return }
    setStartTaskHistory(
      (data || []).filter(
        (t): t is StartTaskRecord => !!t.task_date && t.target_minutes != null
      )
    )
  }, [isLoggedIn, repmeCode])

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useEffect(() => { fetchTodayTasks() }, [fetchTodayTasks])
  useEffect(() => { fetchAllTasks() }, [fetchAllTasks])
  useEffect(() => { fetchStartTaskHistory() }, [fetchStartTaskHistory])

  const handleLogin = async () => {
    if (!repmeCode || !password) { setMessage('コードとパスワードを入力｜Enter code and password'); return }
    setLoading(true); setMessage('')
    const code = repmeCode.trim().toUpperCase()
    const { data, error } = await supabase.from('users').select('*').eq('repme_code', code).single()
    if (error || !data) { setMessage('ユーザーが存在しません｜User not found'); setIsLoggedIn(false); setUserId(''); setLoading(false); return }
    if (data.password !== password) { setMessage('パスワードが違います｜Wrong password'); setIsLoggedIn(false); setUserId(''); setLoading(false); return }
    setRepmeCode(code); setUserId(data.user_id || ''); setIsLoggedIn(true); setMessage(''); setLoading(false)
  }

  const handleLogout = () => {
    setIsLoggedIn(false); setRepmeCode(''); setPassword(''); setUserId('')
    setLogs([]); setTodayTasks([]); setAllTasks([]); setStartTaskHistory([]); setMessage('')
    setLoading(false); setTasksLoading(false)
    setManualMinutes(''); setManualMemo(''); setSavingManualLog(false); setSelectedTaskId(null)
    setEditingId(null); setEditingStartTime(''); setEditingEndTime(''); setEditingMemo('')
    setUpdatingLog(false); setDeletingId(null)
    setShowAllLogs(false)
  }

  const handleManualLogSubmit = async () => {
    if (!manualMinutes.trim()) { setMessage('時間を入力して｜Enter minutes'); return }
    const minutesNumber = Number(manualMinutes)
    if (Number.isNaN(minutesNumber) || minutesNumber <= 0) { setMessage('時間は1以上の数字で入力｜Minutes must be 1 or more'); return }
    if (!repmeCode) { setMessage('REPMEコードがありません｜No REPME code'); return }
    if (!userId) { setMessage('user_id が見つかりません｜user_id not found'); return }
    try {
      setSavingManualLog(true); setMessage('')
      const now = new Date().toISOString()
      const { error } = await supabase.from('work_logs').insert([{
        user_name: repmeCode, minutes: minutesNumber, memo: manualMemo.trim() || null,
        type: 'manual', repme_code: repmeCode, user_id: userId,
        start_time: now, end_time: now, task_id: selectedTaskId ?? null
      }])
      if (error) { console.error(error); setMessage('手動記録の保存に失敗｜Manual log save failed'); return }
      setManualMinutes(''); setManualMemo(''); setSelectedTaskId(null)
      setMessage('手動記録を保存しました｜Manual log saved')
      await fetchLogs(); await fetchTodayTasks()
    } catch (error) { console.error(error); setMessage('エラーが発生しました｜Something went wrong') }
    finally { setSavingManualLog(false) }
  }

  const handleStartEdit = (log: WorkLog) => {
    setEditingId(log.id)
    setEditingStartTime(log.start_time ? toLocalInputValue(log.start_time) : '')
    setEditingEndTime(log.end_time ? toLocalInputValue(log.end_time) : '')
    setEditingMemo(log.memo ?? '')
    setMessage('')
  }

  const handleCancelEdit = () => {
    setEditingId(null); setEditingStartTime(''); setEditingEndTime(''); setEditingMemo(''); setMessage('')
  }

  const handleUpdateLog = async (id: number) => {
    if (!editingStartTime) { setMessage('開始時刻を入力して｜Enter start time'); return }
    const startUTC = toUTC(editingStartTime)
    const endUTC = editingEndTime ? toUTC(editingEndTime) : null
    const minutes = editingStartTime && editingEndTime ? calcMinutes(editingStartTime, editingEndTime) : null
    try {
      setUpdatingLog(true); setMessage('')
      const { error } = await supabase.from('work_logs')
        .update({ start_time: startUTC, end_time: endUTC, memo: editingMemo.trim() || null, minutes, type: 'edited' })
        .eq('id', id).eq('repme_code', repmeCode)
      if (error) { console.error(error); setMessage('更新失敗｜Update failed'); return }
      setEditingId(null); setEditingStartTime(''); setEditingEndTime(''); setEditingMemo('')
      setMessage('ログを更新しました｜Log updated')
      await fetchLogs(); await fetchTodayTasks()
    } catch (e) { console.error(e); setMessage('エラーが発生しました｜Something went wrong') }
    finally { setUpdatingLog(false) }
  }

  const handleDelete = async (id: number) => {
    try {
      setDeletingId(id); setMessage('')
      const { error } = await supabase.from('work_logs').delete().eq('id', id).eq('repme_code', repmeCode)
      if (error) { console.error(error); setMessage('削除失敗｜Delete failed'); return }
      if (editingId === id) { setEditingId(null); setEditingStartTime(''); setEditingEndTime(''); setEditingMemo('') }
      setMessage('ログを削除しました｜Log deleted')
      await fetchLogs(); await fetchTodayTasks()
    } catch (error) { console.error(error); setMessage('エラーが発生しました｜Something went wrong') }
    finally { setDeletingId(null) }
  }

  const totalMinutes = useMemo(() => logs.reduce((sum, log) => sum + (log.minutes || 0), 0), [logs])

  const todayMinutes = useMemo(() => {
    const todayStr = getJSTDateStr(new Date())
    return logs.reduce((sum, log) => {
      if (!log.start_time) return sum
      const dateStr = getJSTDateStr(parseUTCString(log.start_time))
      return dateStr === todayStr ? sum + (log.minutes || 0) : sum
    }, 0)
  }, [logs])

  const weekMinutes = useMemo(() => {
    const nowJST = new Date(Date.now() + jstOffset)
    const day = nowJST.getUTCDay()
    const diffFromMonday = day === 0 ? 6 : day - 1
    const weekStartJST = new Date(nowJST.getTime() - diffFromMonday * 24 * 60 * 60 * 1000)
    const weekStartStr = `${weekStartJST.getUTCFullYear()}-${String(weekStartJST.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStartJST.getUTCDate()).padStart(2, '0')}`
    return logs.reduce((sum, log) => {
      if (!log.start_time) return sum
      const dateStr = getJSTDateStr(parseUTCString(log.start_time))
      return dateStr >= weekStartStr ? sum + (log.minutes || 0) : sum
    }, 0)
  }, [logs])

  const streak = useMemo(() => {
    if (logs.length === 0) return 0
    const dateSet = new Set(logs.map((log) => {
      if (!log.start_time) return ''
      return getJSTDateStr(parseUTCString(log.start_time))
    }).filter(Boolean))

    const todayStr = getJSTDateStr(new Date())
    const hasToday = dateSet.has(todayStr)

    let checkDate = new Date(Date.now() + jstOffset)
    if (!hasToday) {
      checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000)
    }

    let count = 0
    while (true) {
      const dateStr = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}-${String(checkDate.getUTCDate()).padStart(2, '0')}`
      if (!dateSet.has(dateStr)) break
      count++
      checkDate = new Date(checkDate.getTime() - 86400000)
    }
    return count
  }, [logs])

  // Start Plan 達成連続日数
  // 定義: 今日から遡って「その日のtarget_minutes <= その日のwork_logs合計」が連続している日数
  const achievementStreak = useMemo(() => {
    if (startTaskHistory.length === 0 || logs.length === 0) return 0

    // 日別合計minutesマップ（JST日付 → 合計分）
    const dailyMinutesMap: Record<string, number> = {}
    logs.forEach(log => {
      if (!log.start_time) return
      const dateStr = getJSTDateStr(parseUTCString(log.start_time))
      dailyMinutesMap[dateStr] = (dailyMinutesMap[dateStr] || 0) + (log.minutes || 0)
    })

    // task_date → target_minutesマップ
    const targetMap: Record<string, number> = {}
    startTaskHistory.forEach(t => {
      targetMap[t.task_date] = t.target_minutes
    })

    // 今日から遡って連続達成日数をカウント
    const todayStr = getJSTDateStr(new Date())
    let count = 0
    let checkDate = new Date(Date.now() + jstOffset)

    while (true) {
      const dateStr = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}-${String(checkDate.getUTCDate()).padStart(2, '0')}`
      // 未来日はスキップ
      if (dateStr > todayStr) { checkDate = new Date(checkDate.getTime() - 86400000); continue }
      // start planがない日でストップ
      if (!targetMap[dateStr]) break
      const logged = dailyMinutesMap[dateStr] || 0
      // 未達でストップ
      if (logged < targetMap[dateStr]) break
      count++
      checkDate = new Date(checkDate.getTime() - 86400000)
    }
    return count
  }, [startTaskHistory, logs])

  // 累計目標達成日数（Start Planがある日のうち達成した日の総数）
  const achievementTotal = useMemo(() => {
    if (startTaskHistory.length === 0 || logs.length === 0) return 0

    const dailyMinutesMap: Record<string, number> = {}
    logs.forEach(log => {
      if (!log.start_time) return
      const dateStr = getJSTDateStr(parseUTCString(log.start_time))
      dailyMinutesMap[dateStr] = (dailyMinutesMap[dateStr] || 0) + (log.minutes || 0)
    })

    const todayStr = getJSTDateStr(new Date())
    return startTaskHistory.filter(t => {
      if (t.task_date > todayStr) return false
      const logged = dailyMinutesMap[t.task_date] || 0
      return logged >= t.target_minutes
    }).length
  }, [startTaskHistory, logs])

  // Start Planが設定されている日の総数（累計の分母）
  const startPlanTotal = useMemo(() => {
    const todayStr = getJSTDateStr(new Date())
    return startTaskHistory.filter(t => t.task_date <= todayStr).length
  }, [startTaskHistory])

  const chartData = useMemo(() => {
    const grouped: Record<string, number> = {}
    logs.slice().reverse().forEach((log) => {
      if (!log.start_time) return
      const jst = new Date(parseUTCString(log.start_time).getTime() + jstOffset)
      const key = `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`
      grouped[key] = (grouped[key] || 0) + (log.minutes || 0)
    })
    return Object.entries(grouped).map(([date, minutes]) => ({ date, minutes }))
  }, [logs])

  const formatTime = (timeStr: string | null | undefined) => {
    if (!timeStr) return '-'
    const d = parseUTCString(timeStr)
    if (isNaN(d.getTime())) return '-'
    const jst = new Date(d.getTime() + jstOffset)
    return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`
  }

  const formatDate = (timeStr: string | null | undefined) => {
    if (!timeStr) return '-'
    const d = parseUTCString(timeStr)
    if (isNaN(d.getTime())) return '-'
    const jst = new Date(d.getTime() + jstOffset)
    return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()}`
  }

  const formatTimeRange = (start: string | null | undefined, end: string | null | undefined) => {
    const startStr = formatTime(start)
    if (!end) return `${startStr}〜`
    return `${startStr}〜${formatTime(end)}`
  }

  const planTypeLabel = (plan_type: string | null | undefined) => {
    if (plan_type === 'start') return 'Start Plan'
    if (plan_type === 'schedule') return 'Schedule Plan'
    return plan_type || '-'
  }

  const statusColor = (status: string | null | undefined) => {
    switch (status) {
      case 'planned': return '#6A6A6A'
      case 'in_progress': return '#A8C5A0'
      case 'completed': return '#7A9EC0'
      case 'late': return '#C0A07A'
      case 'missed': return '#C07A7A'
      default: return '#6A6A6A'
    }
  }

  const getAchievementStatus = (task: ScheduleTask) => {
    if (task.plan_type !== 'start' || !task.target_minutes) return null
    const logged = (task.logs || []).reduce((sum, l) => sum + (l.minutes || 0), 0)
    const target = task.target_minutes
    const pct = Math.min(100, Math.round((logged / target) * 100))
    return { logged, target, pct }
  }

  const visibleLogs = showAllLogs ? logs : logs.slice(0, 5)

  return (
    <main style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', background: '#030303', color: '#EAEAEA', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(circle at 18% 18%, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 12%, transparent 34%), radial-gradient(circle at 82% 68%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 13%, transparent 34%), linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.06) 18%, transparent 28%), linear-gradient(315deg, transparent 0%, rgba(255,255,255,0.05) 20%, transparent 30%), repeating-linear-gradient(125deg, transparent 0px, transparent 10px, rgba(255,255,255,0.03) 11px, transparent 17px, transparent 28px), radial-gradient(rgba(255,255,255,0.08) 0.8px, transparent 1px)`, backgroundSize: `100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 4px 4px`, opacity: 1 }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `linear-gradient(160deg, rgba(255,255,255,0.06), transparent 18%, transparent 78%, rgba(255,255,255,0.05)), radial-gradient(circle at 24% 26%, rgba(255,255,255,0.08), transparent 22%), radial-gradient(circle at 78% 70%, rgba(255,255,255,0.08), transparent 22%)`, filter: 'blur(22px)', opacity: 0.95 }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '980px', margin: '0 auto', padding: '28px 18px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '1.2px', marginBottom: '28px', textAlign: 'center' }}>REPME | Focus Gym</h1>

        {!isLoggedIn ? (
          <div style={{ width: '100%', maxWidth: '360px', margin: '0 auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '18px', background: 'rgba(17,17,17,0.72)', backdropFilter: 'blur(6px)' }}>
            <div style={{ fontSize: '12px', color: '#9A9A9A', marginBottom: '14px' }}>ログイン｜Login</div>
            <input value={repmeCode} onChange={(e) => setRepmeCode(e.target.value)} placeholder="REPMEコード｜REPME Code" style={inputStyle} />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード｜Password" style={inputStyle} />
            <button onClick={handleLogin} disabled={loading} style={buttonStyle}>{loading ? 'ログイン中｜Loading' : 'ログイン｜Login'}</button>
            {message && <p style={{ color: '#B8B8B8', marginTop: '12px', fontSize: '12px', lineHeight: 1.5 }}>{message}</p>}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <p style={{ fontSize: '12px', color: '#9A9A9A', margin: 0 }}>現在のコード｜Current Code : {repmeCode}</p>
              <button onClick={handleLogout} style={{ padding: '8px 12px', background: 'rgba(17,17,17,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#EAEAEA', cursor: 'pointer', fontSize: '12px', backdropFilter: 'blur(6px)' }}>ログアウト｜Logout</button>
            </div>

            <section style={glassBox}>
              <div style={sectionLabel}>今日のtask｜Today&apos;s Tasks</div>
              {tasksLoading ? <p style={emptyText}>読み込み中｜Loading</p>
                : todayTasks.length === 0 ? <p style={emptyText}>今日のtaskはまだありません｜No tasks for today</p>
                : (
                  <div>
                    {todayTasks.map((task) => {
                      const achievement = getAchievementStatus(task)
                      return (
                        <div key={task.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '14px 0' }}>
                          <div style={{ fontSize: '15px', fontWeight: 600, color: '#EAEAEA', marginBottom: '6px' }}>
                            {task.title?.trim() ? task.title : '作業'}
                          </div>
                          <div style={{ fontSize: '12px', color: '#B8B8B8', lineHeight: 1.7, marginBottom: '8px' }}>
                            {task.plan_type === 'start' ? (
                              <div>Plan: Start Plan</div>
                            ) : (
                              <>
                                <div>{formatTimeRange(task.scheduled_start_at, task.end_time)}</div>
                                <div>Plan: {planTypeLabel(task.plan_type)}</div>
                              </>
                            )}
                          </div>
                          {achievement && (
                            <div style={{ marginBottom: '10px' }}>
                              <div style={{ fontSize: '12px', color: '#B8B8B8', marginBottom: '6px' }}>
                                目標：{achievement.target}分　記録：{achievement.logged}分
                              </div>
                              <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${achievement.pct}%`, background: achievement.pct >= 100 ? '#7A9EC0' : '#A8C5A0', borderRadius: '2px', transition: 'width 0.3s ease' }} />
                              </div>
                              <div style={{ fontSize: '11px', color: achievement.pct >= 100 ? '#7A9EC0' : '#7A7A7A', marginTop: '4px' }}>
                                {achievement.pct >= 100 ? '達成｜Achieved' : `${achievement.pct}%`}
                              </div>
                            </div>
                          )}
                          <div style={{ display: 'inline-block', fontSize: '11px', color: statusColor(task.status), padding: '3px 7px', border: `1px solid ${statusColor(task.status)}`, borderRadius: '999px', background: 'rgba(255,255,255,0.03)', marginBottom: task.logs && task.logs.length > 0 ? '12px' : '0' }}>
                            {task.status || 'planned'}
                          </div>
                          {task.logs && task.logs.length > 0 && (
                            <div style={{ borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: '12px', marginTop: '8px' }}>
                              {task.logs.map((log) => (
                                <div key={log.id} style={{ fontSize: '12px', color: '#B8B8B8', lineHeight: 1.8, marginBottom: '6px', padding: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                                  <div style={{ color: '#EAEAEA', fontWeight: 500, marginBottom: '2px' }}>{log.minutes ?? 0}分</div>
                                  <div>{formatTime(log.start_time)} → {formatTime(log.end_time)}</div>
                                  <div style={{ display: 'inline-block', fontSize: '10px', color: '#8F8F8F', padding: '2px 6px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '999px', background: 'rgba(255,255,255,0.03)', marginTop: '4px' }}>
                                    {log.type === 'manual' ? '[MANUAL]' : log.type === 'edited' ? '[EDITED]' : '[REALTIME]'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
            </section>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '18px' }}>
              <Stat label="合計時間｜Total" value={`${totalMinutes}分`} />
              <Stat label="今日｜Today" value={`${todayMinutes}分`} />
              <Stat label="今週｜This Week" value={`${weekMinutes}分`} />
              <Stat label="連続日数｜Streak" value={`${streak}日`} />
              <Stat
                label="目標達成連続日数 / 累計目標達成日数"
                value={startPlanTotal > 0 ? `${achievementStreak}日 / ${achievementTotal}日` : '-'}
              />
            </div>

            <section style={glassBox}>
              <div style={sectionLabel}>plan確認｜Plans</div>
              {allTasks.length === 0 ? <p style={emptyText}>planはまだありません｜No plans yet</p> : (
                <div>
                  {allTasks.map((task) => (
                    <div key={task.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#EAEAEA', marginBottom: '4px' }}>{task.title?.trim() ? task.title : '作業'}</div>
                        <div style={{ fontSize: '12px', color: '#B8B8B8', lineHeight: 1.6 }}>
                          {task.plan_type === 'start' ? (
                            <div>目標：{task.target_minutes}分</div>
                          ) : (
                            <>
                              <div>{formatDate(task.scheduled_start_at)} {formatTimeRange(task.scheduled_start_at, task.end_time)}</div>
                              <div>{planTypeLabel(task.plan_type)}</div>
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'inline-block', fontSize: '11px', color: statusColor(task.status), padding: '3px 7px', border: `1px solid ${statusColor(task.status)}`, borderRadius: '999px', background: 'rgba(255,255,255,0.03)', whiteSpace: 'nowrap' }}>
                        {task.status || 'planned'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={glassBox}>
              <div style={sectionLabel}>手動記録｜Manual Log</div>
              <div style={{ display: 'grid', gap: '10px' }}>
                <select value={selectedTaskId ?? ''} onChange={(e) => setSelectedTaskId(e.target.value ? Number(e.target.value) : null)}
                  style={{ width: '100%', padding: '10px 12px', background: 'rgba(3,3,3,0.88)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#EAEAEA', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}>
                  <option value=''>taskに紐付けない｜No task</option>
                  {todayTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title?.trim() ? task.title : '作業'}
                      {task.plan_type === 'start' ? ` (目標${task.target_minutes}分)` : ` (${formatTimeRange(task.scheduled_start_at, task.end_time)})`}
                    </option>
                  ))}
                </select>
                <input type="number" min="1" value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)} placeholder="時間（分）｜Minutes" style={inputStyle} />
                <textarea value={manualMemo} onChange={(e) => setManualMemo(e.target.value)} placeholder="メモ（任意）｜Memo (optional)" rows={3} style={textareaStyle} />
                <button onClick={handleManualLogSubmit} disabled={savingManualLog} style={buttonStyle}>{savingManualLog ? '保存中｜Saving' : '保存する｜Save'}</button>
              </div>
            </section>

            <section style={glassBox}>
              <div style={sectionLabel}>日別作業｜Daily Work</div>
              {loading ? <p style={emptyText}>読み込み中｜Loading</p>
                : chartData.length === 0 ? <p style={emptyText}>データなし｜No data</p>
                : (
                  <div style={{ width: '100%', height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="date" stroke="#7A7A7A" tickLine={false} axisLine={false} />
                        <YAxis stroke="#7A7A7A" tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#EAEAEA' }} formatter={(value) => [`${value}分`, '作業時間｜Work']} />
                        <Bar dataKey="minutes" fill="#EAEAEA" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
            </section>

            <section style={glassBox}>
              <div style={sectionLabel}>作業ログ｜Work Logs</div>
              {message && <p style={{ color: '#B8B8B8', marginBottom: '10px', fontSize: '12px' }}>{message}</p>}
              {loading ? <p style={emptyText}>読み込み中｜Loading</p>
                : logs.length === 0 ? <p style={emptyText}>ログがまだありません｜No logs yet</p>
                : (
                  <div>
                    {visibleLogs.map((log) => {
                      const isEditing = editingId === log.id
                      const typeLabel = log.type === 'manual' ? '[MANUAL]' : log.type === 'edited' ? '[EDITED]' : '[REALTIME]'
                      const previewMinutes = editingStartTime && editingEndTime ? calcMinutes(editingStartTime, editingEndTime) : null
                      return (
                        <div key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '12px 0', fontSize: '13px', color: '#D8D8D8' }}>
                          {isEditing ? (
                            <div style={{ marginBottom: '8px' }}>
                              <div style={{ fontSize: '11px', color: '#9A9A9A', marginBottom: '4px' }}>開始時刻｜Start time</div>
                              <input type="datetime-local" value={editingStartTime} onChange={(e) => setEditingStartTime(e.target.value)} style={{ ...inputStyle, marginBottom: '10px' }} />
                              <div style={{ fontSize: '11px', color: '#9A9A9A', marginBottom: '4px' }}>終了時刻｜End time</div>
                              <input type="datetime-local" value={editingEndTime} onChange={(e) => setEditingEndTime(e.target.value)} style={{ ...inputStyle, marginBottom: '10px' }} />
                              {previewMinutes !== null && <div style={{ fontSize: '11px', color: '#7A7A7A', marginBottom: '10px' }}>自動計算｜Auto: {previewMinutes}分</div>}
                              <div style={{ fontSize: '11px', color: '#9A9A9A', marginBottom: '4px' }}>メモ｜Memo</div>
                              <textarea value={editingMemo} onChange={(e) => setEditingMemo(e.target.value)} placeholder="メモ（任意）｜Memo (optional)" rows={2} style={{ ...textareaStyle, marginBottom: '10px' }} />
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button onClick={() => handleUpdateLog(log.id)} disabled={updatingLog} style={{ ...smallButtonStyle, opacity: updatingLog ? 0.7 : 1, cursor: updatingLog ? 'default' : 'pointer' }}>
                                  {updatingLog ? '保存中｜Saving' : '保存｜Save'}
                                </button>
                                <button onClick={handleCancelEdit} disabled={updatingLog} style={{ ...smallButtonStyle, opacity: updatingLog ? 0.7 : 1, cursor: updatingLog ? 'default' : 'pointer' }}>
                                  キャンセル｜Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ marginBottom: '4px' }}>
                              {log.minutes ?? 0}分｜{formatDate(log.start_time || log.created_at)} {formatTimeRange(log.start_time, log.end_time)}
                            </div>
                          )}
                          {!isEditing && (
                            <>
                              <div style={{ display: 'inline-block', fontSize: '11px', color: '#8F8F8F', marginBottom: log.memo ? '6px' : '8px', padding: '3px 7px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '999px', background: 'rgba(255,255,255,0.03)' }}>{typeLabel}</div>
                              {log.memo && <div style={{ fontSize: '12px', color: '#B8B8B8', lineHeight: 1.5, marginBottom: '8px' }}>{log.memo}</div>}
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button onClick={() => handleStartEdit(log)} style={smallButtonStyle}>編集｜Edit</button>
                                <button onClick={() => handleDelete(log.id)} disabled={deletingId === log.id} style={{ ...smallButtonStyle, opacity: deletingId === log.id ? 0.7 : 1, cursor: deletingId === log.id ? 'default' : 'pointer' }}>
                                  {deletingId === log.id ? '削除中｜Deleting' : '削除｜Delete'}
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                    {logs.length > 5 && (
                      <button onClick={() => setShowAllLogs(!showAllLogs)} style={{ ...smallButtonStyle, marginTop: '12px' }}>
                        {showAllLogs ? '閉じる｜Show less' : `もっと見る｜Show all (${logs.length}件)`}
                      </button>
                    )}
                  </div>
                )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 12px 11px', background: 'rgba(17,17,17,0.68)', backdropFilter: 'blur(6px)' }}>
      <div style={{ fontSize: '11px', color: '#949494', marginBottom: '5px', lineHeight: 1.4 }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 600, lineHeight: 1.2, color: '#EAEAEA' }}>{value}</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', marginBottom: '10px', padding: '10px 12px',
  background: 'rgba(3,3,3,0.88)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px', color: '#EAEAEA', fontSize: '14px', outline: 'none', boxSizing: 'border-box'
}
const textareaStyle: React.CSSProperties = {
  width: '100%', marginBottom: '10px', padding: '10px 12px',
  background: 'rgba(3,3,3,0.88)', border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px', color: '#EAEAEA', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical'
}
const buttonStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', background: 'rgba(8,8,8,0.9)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px',
  color: '#EAEAEA', cursor: 'pointer', fontSize: '14px'
}
const smallButtonStyle: React.CSSProperties = {
  width: 'auto', padding: '7px 10px', background: 'rgba(8,8,8,0.9)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px',
  color: '#EAEAEA', cursor: 'pointer', fontSize: '12px'
}
const glassBox: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '14px',
  background: 'rgba(17,17,17,0.68)', backdropFilter: 'blur(6px)', marginBottom: '18px'
}
const sectionLabel: React.CSSProperties = { fontSize: '12px', color: '#949494', marginBottom: '10px' }
const emptyText: React.CSSProperties = { fontSize: '13px', color: '#B8B8B8', margin: 0 }