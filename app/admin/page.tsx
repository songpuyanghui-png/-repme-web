'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type WorkLog = {
  id: number
  user_name: string | null
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

type UserRow = {
  repme_code: string
  password: string
  user_id?: string | null
  is_private?: boolean | null
  display_name?: string | null
}

type ScheduleTask = {
  id: number
  repme_code: string
  title?: string | null
  plan_type?: string | null
  status?: string | null
  task_date?: string | null
  scheduled_start_at?: string | null
  target_minutes?: number | null
  logs?: WorkLog[]
}

type UserActivity = {
  code: string
  totalMinutes: number
  lastLogAt: string | null
  recordedDaysCount: number
  last7DaysMinutes: number
  last7DaysLogCount: number
  realtimeCount: number
  manualCount: number
}

type NoActivityUser = {
  repme_code: string
  display_name: string
  lastLogAt: string | null
  absentDays: number
  reportType: 'absent' | 'no_schedule' | null
}

type AbsenceReport = {
  repme_code: string
  report_date: string
  report_type: 'absent' | 'no_schedule'
}

// ユーザー一覧用: 目標時間連続達成日数
type UserAchievementStreak = {
  repme_code: string
  streak: number
}

// ユーザー詳細用: 今日の達成情報
type TodayAchievement = {
  targetMinutes: number | null
  todayMinutes: number
  rate: number | null
}

const jstOffset = 9 * 60 * 60 * 1000

function getJSTDateStr(date: Date): string {
  const jst = new Date(date.getTime() + jstOffset)
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`
}

function parseUTCString(timeStr: string): Date {
  if (timeStr.endsWith('Z')) return new Date(timeStr)
  if (timeStr.length > 10 && (timeStr.slice(10).includes('+') || timeStr.slice(10).includes('-'))) {
    return new Date(timeStr)
  }
  return new Date(timeStr.replace(' ', 'T') + 'Z')
}

export default function AdminPage() {
  const [isAuthed, setIsAuthed] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginMessage, setLoginMessage] = useState('')

  const [logs, setLogs] = useState<WorkLog[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [absenceReports, setAbsenceReports] = useState<AbsenceReport[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [userTasks, setUserTasks] = useState<ScheduleTask[]>([])
  const [userLogsDetail, setUserLogsDetail] = useState<WorkLog[]>([])
  const [todayAchievement, setTodayAchievement] = useState<TodayAchievement | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // ユーザー一覧用: 各ユーザーの目標時間連続達成日数
  const [achievementStreaks, setAchievementStreaks] = useState<UserAchievementStreak[]>([])
  const [streaksLoading, setStreaksLoading] = useState(false)

  const [tab, setTab] = useState<'stats' | 'users'>('stats')

  const checkAuth = useCallback(async () => {
    try {
      setCheckingAuth(true)
      const res = await fetch('/api/admin-login', { method: 'GET' })
      const data = await res.json()
      setIsAuthed(Boolean(data.ok))
    } catch { setIsAuthed(false) }
    finally { setCheckingAuth(false) }
  }, [])

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoginLoading(true)
      setLoginMessage('')
      const res = await fetch('/api/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      const data = await res.json()
      if (!res.ok || !data.ok) { setLoginMessage('パスワードが違う｜Invalid password'); setIsAuthed(false); return }
      setIsAuthed(true)
      setPassword('')
    } catch { setLoginMessage('ログイン失敗｜Login failed'); setIsAuthed(false) }
    finally { setLoginLoading(false) }
  }, [password])

  const handleLogout = useCallback(async () => {
    try { await fetch('/api/admin-logout', { method: 'POST' }) } catch {}
    setIsAuthed(false); setLogs([]); setUsers([]); setMessage(''); setSelectedUser(null)
    setAchievementStreaks([])
  }, [])

  const fetchAdminData = useCallback(async () => {
    if (!isAuthed) return
    try {
      setLoading(true); setMessage('')

      const nowJST = new Date(Date.now() + jstOffset)
      const todayStr = `${nowJST.getUTCFullYear()}-${String(nowJST.getUTCMonth() + 1).padStart(2, '0')}-${String(nowJST.getUTCDate()).padStart(2, '0')}`

      const [
        { data: logsData, error: logsError },
        { data: usersData, error: usersError },
        { data: absenceData, error: absenceError }
      ] = await Promise.all([
        supabase.from('work_logs').select('*').order('created_at', { ascending: false }),
        supabase.from('users').select('*'),
        supabase.from('absence_reports').select('repme_code, report_date, report_type').eq('report_date', todayStr)
      ])

      if (logsError) { console.error(logsError); setMessage('ログ取得失敗'); setLogs([]) }
      else setLogs(logsData || [])
      if (usersError) { console.error(usersError); setUsers([]) }
      else setUsers(usersData || [])
      if (absenceError) { console.error(absenceError); setAbsenceReports([]) }
      else setAbsenceReports(absenceData || [])

    } catch { setMessage('エラーが発生しました') }
    finally { setLoading(false) }
  }, [isAuthed])

  // 全ユーザーの目標時間連続達成日数を計算
  const fetchAllAchievementStreaks = useCallback(async () => {
    if (!isAuthed) return
    setStreaksLoading(true)
    try {
      const todayStr = getJSTDateStr(new Date())

      // 全ユーザーのstart plan taskを取得
      const { data: startTasks, error: taskError } = await supabase
        .from('schedule_tasks')
        .select('repme_code, task_date, target_minutes')
        .eq('plan_type', 'start')
        .lte('task_date', todayStr)
        .order('task_date', { ascending: false })
      if (taskError) { console.error(taskError); setStreaksLoading(false); return }

      // 全ユーザーのwork_logsを取得
      const { data: allLogs, error: logError } = await supabase
        .from('work_logs')
        .select('repme_code, start_time, minutes')
      if (logError) { console.error(logError); setStreaksLoading(false); return }

      // repme_code → { task_date → target_minutes }
      const taskMap: Record<string, Record<string, number>> = {}
      ;(startTasks || []).forEach(t => {
        if (!t.repme_code || !t.task_date || t.target_minutes == null) return
        if (!taskMap[t.repme_code]) taskMap[t.repme_code] = {}
        taskMap[t.repme_code][t.task_date] = t.target_minutes
      })

      // repme_code → { dateStr → 合計minutes }
      const logMap: Record<string, Record<string, number>> = {}
      ;(allLogs || []).forEach(l => {
        if (!l.repme_code || !l.start_time) return
        const dateStr = getJSTDateStr(parseUTCString(l.start_time))
        if (!logMap[l.repme_code]) logMap[l.repme_code] = {}
        logMap[l.repme_code][dateStr] = (logMap[l.repme_code][dateStr] || 0) + (l.minutes || 0)
      })

      // 各ユーザーの連続達成日数を計算
      const results: UserAchievementStreak[] = Object.keys(taskMap).map(repmeCode => {
        const targetsByDate = taskMap[repmeCode]
        const logsByDate = logMap[repmeCode] || {}
        let count = 0
        let checkDate = new Date(Date.now() + jstOffset)

        // 今日達成済みなら今日から、未達なら昨日から遡る
        const todayTarget = targetsByDate[todayStr]
        const todayLogged = logsByDate[todayStr] || 0
        const todayAchieved = todayTarget != null && todayLogged >= todayTarget
        if (!todayAchieved) {
          checkDate = new Date(checkDate.getTime() - 86400000)
        }

        while (true) {
          const dateStr = `${checkDate.getUTCFullYear()}-${String(checkDate.getUTCMonth() + 1).padStart(2, '0')}-${String(checkDate.getUTCDate()).padStart(2, '0')}`
          if (!targetsByDate[dateStr]) break
          const logged = logsByDate[dateStr] || 0
          if (logged < targetsByDate[dateStr]) break
          count++
          checkDate = new Date(checkDate.getTime() - 86400000)
        }
        return { repme_code: repmeCode, streak: count }
      })

      setAchievementStreaks(results)
    } catch (e) {
      console.error(e)
    } finally {
      setStreaksLoading(false)
    }
  }, [isAuthed])

  const fetchUserDetail = useCallback(async (user: UserRow) => {
    setDetailLoading(true)
    setSelectedUser(user)
    setTodayAchievement(null)

    const todayStr = getJSTDateStr(new Date())
    const todayStartUTC = new Date(todayStr + 'T00:00:00+09:00').toISOString()
    const todayEndUTC = new Date(todayStr + 'T23:59:59+09:00').toISOString()

    const { data: tasks, error: taskError } = await supabase
      .from('schedule_tasks')
      .select('id, repme_code, title, plan_type, status, task_date, scheduled_start_at, target_minutes')
      .eq('repme_code', user.repme_code)
      .order('scheduled_start_at', { ascending: false })
    if (taskError) console.error(taskError)

    const { data: allLogs, error: logError } = await supabase
      .from('work_logs')
      .select('*')
      .eq('repme_code', user.repme_code)
      .order('created_at', { ascending: false })
    if (logError) console.error(logError)

    const tasksWithLogs = (tasks || []).map(task => ({
      ...task,
      logs: (allLogs || []).filter(l => l.task_id === task.id)
    }))

    setUserTasks(tasksWithLogs)
    setUserLogsDetail(allLogs || [])

    // 今日のStart Plan target_minutes
    const todayStartTask = (tasks || []).find(
      t => t.plan_type === 'start' && t.task_date === todayStr
    )

    // 今日のwork_logs合計（JST日付で判定）
    const todayLogMinutes = (allLogs || [])
      .filter(l => {
        if (!l.start_time) return false
        const d = parseUTCString(l.start_time)
        const jst = new Date(d.getTime() + jstOffset)
        const dateStr = `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`
        return dateStr === todayStr
      })
      .reduce((s, l) => s + (l.minutes || 0), 0)

    // todayStartUTC / todayEndUTC は上で定義済み（lint対策で参照）
    void todayStartUTC; void todayEndUTC

    if (todayStartTask?.target_minutes != null) {
      const target = todayStartTask.target_minutes
      const rate = target > 0 ? Math.round((todayLogMinutes / target) * 100) : null
      setTodayAchievement({ targetMinutes: target, todayMinutes: todayLogMinutes, rate })
    } else {
      setTodayAchievement({ targetMinutes: null, todayMinutes: todayLogMinutes, rate: null })
    }

    setDetailLoading(false)
  }, [])

  useEffect(() => { checkAuth() }, [checkAuth])
  useEffect(() => {
    if (isAuthed) {
      fetchAdminData()
      fetchAllAchievementStreaks()
    }
  }, [isAuthed, fetchAdminData, fetchAllAchievementStreaks])

  const displayNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    users.forEach(u => { map[u.repme_code] = u.display_name || u.repme_code })
    return map
  }, [users])

  // 連続達成日数マップ（repme_code → streak）
  const achievementStreakMap = useMemo(() => {
    const map: Record<string, number> = {}
    achievementStreaks.forEach(s => { map[s.repme_code] = s.streak })
    return map
  }, [achievementStreaks])

  const visibleUsers = useMemo(() => users, [users])
  const visibleLogs = useMemo(() => logs, [logs])

  const totalMinutes = useMemo(() => visibleLogs.reduce((s, l) => s + (l.minutes || 0), 0), [visibleLogs])
  const totalLogs = visibleLogs.length
  const totalUsers = visibleUsers.length

  const todayLogs = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return visibleLogs.filter(l => {
      const d = new Date(l.start_time || l.created_at); d.setHours(0, 0, 0, 0)
      return d.getTime() === today.getTime()
    })
  }, [visibleLogs])

  const todayMinutes = useMemo(() => todayLogs.reduce((s, l) => s + (l.minutes || 0), 0), [todayLogs])
  const activeUsersToday = useMemo(() => new Set(todayLogs.map(l => l.repme_code).filter(Boolean)).size, [todayLogs])

  const logsLast7Days = useMemo(() => {
    const ago = new Date(); ago.setDate(ago.getDate() - 6); ago.setHours(0, 0, 0, 0)
    return visibleLogs.filter(l => new Date(l.start_time || l.created_at) >= ago)
  }, [visibleLogs])

  const activeUsers7Days = useMemo(() => new Set(logsLast7Days.map(l => l.repme_code).filter(Boolean)).size, [logsLast7Days])
  const averageMinutesPerUser = useMemo(() => {
    if (activeUsers7Days === 0) return 0
    return Math.round(logsLast7Days.reduce((s, l) => s + (l.minutes || 0), 0) / activeUsers7Days)
  }, [logsLast7Days, activeUsers7Days])

  const manualCount = useMemo(() => visibleLogs.filter(l => l.type === 'manual').length, [visibleLogs])
  const realtimeCount = useMemo(() => visibleLogs.filter(l => l.type !== 'manual').length, [visibleLogs])
  const manualRatio = useMemo(() => visibleLogs.length === 0 ? 0 : Math.round(manualCount / visibleLogs.length * 100), [manualCount, visibleLogs])
  const realtimeRatio = useMemo(() => visibleLogs.length === 0 ? 0 : Math.round(realtimeCount / visibleLogs.length * 100), [realtimeCount, visibleLogs])

  const chartData = useMemo(() => {
    const grouped: Record<string, number> = {}
    visibleLogs.slice().reverse().forEach(l => {
      if (!l.start_time) return
      const d = new Date(l.start_time + 'Z')
      const key = `${d.getMonth() + 1}/${d.getDate()}`
      grouped[key] = (grouped[key] || 0) + (l.minutes || 0)
    })
    return Object.entries(grouped).map(([date, minutes]) => ({ date, minutes }))
  }, [visibleLogs])

  const typeChartData = useMemo(() => [
    { name: 'REALTIME', count: realtimeCount },
    { name: 'MANUAL', count: manualCount }
  ], [realtimeCount, manualCount])

  const userActivities = useMemo<UserActivity[]>(() => {
    const map: Record<string, {
      totalMinutes: number; lastLogAt: string | null
      recordedDayKeys: Set<string>; last7DaysMinutes: number
      last7DaysLogCount: number; realtimeCount: number; manualCount: number
    }> = {}
    const ago = new Date(); ago.setDate(ago.getDate() - 6); ago.setHours(0, 0, 0, 0)
    visibleLogs.forEach(l => {
      if (!l.repme_code) return
      if (!map[l.repme_code]) map[l.repme_code] = { totalMinutes: 0, lastLogAt: null, recordedDayKeys: new Set(), last7DaysMinutes: 0, last7DaysLogCount: 0, realtimeCount: 0, manualCount: 0 }
      const d = new Date(l.start_time || l.created_at)
      map[l.repme_code].totalMinutes += l.minutes || 0
      map[l.repme_code].recordedDayKeys.add(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`)
      if (!map[l.repme_code].lastLogAt || d > new Date(map[l.repme_code].lastLogAt!)) map[l.repme_code].lastLogAt = l.start_time || l.created_at
      if (d >= ago) { map[l.repme_code].last7DaysMinutes += l.minutes || 0; map[l.repme_code].last7DaysLogCount++ }
      if (l.type === 'manual') map[l.repme_code].manualCount++; else map[l.repme_code].realtimeCount++
    })
    return Object.entries(map).map(([code, v]) => ({
      code, totalMinutes: v.totalMinutes, lastLogAt: v.lastLogAt,
      recordedDaysCount: v.recordedDayKeys.size, last7DaysMinutes: v.last7DaysMinutes,
      last7DaysLogCount: v.last7DaysLogCount, realtimeCount: v.realtimeCount, manualCount: v.manualCount
    })).sort((a, b) => b.totalMinutes - a.totalMinutes)
  }, [visibleLogs])

  const todayAbsenceMap = useMemo(() => {
    const map: Record<string, 'absent' | 'no_schedule'> = {}
    absenceReports.forEach(r => { map[r.repme_code] = r.report_type })
    return map
  }, [absenceReports])

  const noActivityToday = useMemo<NoActivityUser[]>(() => {
    const nowJST = new Date(Date.now() + jstOffset)
    const todayStr = `${nowJST.getUTCFullYear()}-${String(nowJST.getUTCMonth() + 1).padStart(2, '0')}-${String(nowJST.getUTCDate()).padStart(2, '0')}`

    const activeToday = new Set(
      logs
        .filter(l => {
          if (!l.start_time) return false
          const jst = new Date(new Date(l.start_time).getTime() + jstOffset)
          const dateStr = `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`
          return dateStr === todayStr
        })
        .map(l => l.repme_code)
        .filter(Boolean)
    )

    const lastLogMap: Record<string, string> = {}
    logs.forEach(l => {
      if (!l.repme_code || !l.start_time) return
      if (!lastLogMap[l.repme_code] || l.start_time > lastLogMap[l.repme_code]) {
        lastLogMap[l.repme_code] = l.start_time
      }
    })

    return users
      .filter(u => !activeToday.has(u.repme_code))
      .map(u => {
        const lastLog = lastLogMap[u.repme_code]
        let absentDays = 0
        if (lastLog) {
          const jst = new Date(new Date(lastLog).getTime() + jstOffset)
          const lastDateStr = `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`
          const diffMs = new Date(todayStr).getTime() - new Date(lastDateStr).getTime()
          absentDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)) - 1)
        }
        return {
          repme_code: u.repme_code,
          display_name: u.display_name || u.repme_code,
          lastLogAt: lastLog || null,
          absentDays,
          reportType: todayAbsenceMap[u.repme_code] || null
        }
      })
      .sort((a, b) => b.absentDays - a.absentDays)
  }, [users, logs, todayAbsenceMap])

  const formatTime = (s: string | null | undefined) => {
    if (!s) return '-'
    return new Date(s + 'Z').toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
  }
  const formatDate = (s: string | null | undefined) => {
    if (!s) return '-'
    return new Date(s + 'Z').toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo' })
  }
  const statusColor = (status: string | null | undefined) => {
    switch (status) {
      case 'planned': return '#6A6A6A'; case 'in_progress': return '#A8C5A0'
      case 'completed': return '#7A9EC0'; case 'late': return '#C0A07A'
      case 'missed': return '#C07A7A'; default: return '#6A6A6A'
    }
  }

  const renderAbsentStatus = (u: NoActivityUser) => {
    const leftLabel = u.absentDays === 0 ? '本日未作業' : `${u.absentDays}日連続欠席`
    const leftColor = u.absentDays >= 2 ? '#C07A7A' : '#C0A07A'
    let rightLabel = ''
    let rightColor = ''
    if (u.reportType === 'absent') {
      rightLabel = '欠席届提出済み ✅'; rightColor = '#A8C5A0'
    } else if (u.reportType === 'no_schedule') {
      rightLabel = '予定提出無し届済み 📋'; rightColor = '#7A9EC0'
    } else if (u.absentDays >= 1) {
      rightLabel = '無断欠席 ⚠️'; rightColor = '#C07A7A'
    } else {
      rightLabel = '未提出'; rightColor = '#6A6A6A'
    }
    return { leftLabel, leftColor, rightLabel, rightColor }
  }

  if (checkingAuth) return (
    <main style={pageStyle}><CenteredCard><h1 style={loginTitle}>REPME | Admin</h1><p style={loginSub}>確認中...</p></CenteredCard></main>
  )

  if (!isAuthed) return (
    <main style={pageStyle}>
      <CenteredCard>
        <h1 style={loginTitle}>REPME | Admin Login</h1>
        <p style={loginSub}>管理者専用ページ｜Admin only</p>
        <form onSubmit={handleLogin} style={{ display: 'grid', gap: '10px' }}>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="管理者パスワード｜Admin Password" style={inputStyle} autoComplete="current-password" />
          <button type="submit" disabled={loginLoading} style={loginButtonStyle}>{loginLoading ? 'ログイン中...' : 'ログイン｜Login'}</button>
        </form>
        {loginMessage && <p style={loginMessageStyle}>{loginMessage}</p>}
      </CenteredCard>
    </main>
  )

  if (selectedUser) return (
    <main style={pageStyle}>
      <BackgroundLayer />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: '1200px', margin: '0 auto', padding: '28px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <button onClick={() => setSelectedUser(null)} style={smallButtonStyle}>← 一覧に戻る</button>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '12px 0 4px' }}>
              {displayNameMap[selectedUser.repme_code] || selectedUser.repme_code}
            </h2>
            {selectedUser.user_id && <div style={{ fontSize: '11px', color: '#6A6A6A' }}>{selectedUser.user_id}</div>}
          </div>
          <button onClick={handleLogout} style={smallButtonStyle}>ログアウト｜Logout</button>
        </div>

        {detailLoading ? <p style={emptyText}>読み込み中...</p> : (
          <>
            {/* 今日の達成状況 */}
            <section style={{ ...glassBox, marginBottom: '18px' }}>
              <div style={sectionLabel}>今日の達成状況｜Today&apos;s Achievement</div>
              {todayAchievement ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                  <MiniStat
                    label="目標時間｜Target"
                    value={todayAchievement.targetMinutes != null ? `${todayAchievement.targetMinutes}分` : '未設定'}
                  />
                  <MiniStat
                    label="本日合計｜Today Total"
                    value={`${todayAchievement.todayMinutes}分`}
                  />
                  <MiniStat
                    label="達成率｜Rate"
                    value={
                      todayAchievement.rate != null
                        ? `${Math.min(todayAchievement.rate, 100)}%${todayAchievement.rate >= 100 ? ' ✅' : ''}`
                        : '-'
                    }
                  />
                </div>
              ) : (
                <p style={emptyText}>データなし</p>
              )}
            </section>

            <section style={{ ...glassBox, marginBottom: '18px' }}>
              <div style={sectionLabel}>schedule_tasks｜{userTasks.length}件</div>
              {userTasks.length === 0 ? <p style={emptyText}>taskなし</p> : (
                <div>
                  {userTasks.map(task => (
                    <div key={task.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '12px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#EAEAEA', marginBottom: '4px' }}>{task.title || '作業'}</div>
                          <div style={{ fontSize: '12px', color: '#B8B8B8', lineHeight: 1.6 }}>
                            {task.plan_type === 'start'
                              ? `Start Plan｜目標: ${task.target_minutes}分｜${task.task_date || '-'}`
                              : `Schedule Plan｜${formatDate(task.scheduled_start_at)}｜${task.task_date || '-'}`}
                          </div>
                        </div>
                        <div style={{ fontSize: '11px', color: statusColor(task.status), padding: '3px 7px', border: `1px solid ${statusColor(task.status)}`, borderRadius: '999px', whiteSpace: 'nowrap' }}>
                          {task.status || 'planned'}
                        </div>
                      </div>
                      {task.logs && task.logs.length > 0 && (
                        <div style={{ borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: '12px', marginTop: '6px' }}>
                          {task.logs.map(log => (
                            <div key={log.id} style={{ fontSize: '12px', color: '#B8B8B8', marginBottom: '4px', padding: '6px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                              <span style={{ color: '#EAEAEA', fontWeight: 500 }}>{log.minutes ?? 0}分</span>
                              　{formatTime(log.start_time)} → {formatTime(log.end_time)}
                              　<span style={{ fontSize: '10px', color: '#6A6A6A' }}>[{(log.type || 'realtime').toUpperCase()}]</span>
                              {log.memo && <div style={{ marginTop: '2px', color: '#9A9A9A' }}>{log.memo}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={glassBox}>
              <div style={sectionLabel}>work_logs（全件）｜{userLogsDetail.length}件　合計: {userLogsDetail.reduce((s, l) => s + (l.minutes || 0), 0)}分</div>
              {userLogsDetail.length === 0 ? <p style={emptyText}>ログなし</p> : (
                <div>
                  {userLogsDetail.map(log => (
                    <div key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '10px 0', fontSize: '13px', color: '#D8D8D8' }}>
                      <span style={{ fontWeight: 500 }}>{log.minutes ?? 0}分</span>
                      　{formatDate(log.start_time || log.created_at)} {formatTime(log.start_time)} → {formatTime(log.end_time)}
                      　<span style={{ fontSize: '11px', color: '#6A6A6A' }}>[{(log.type || 'realtime').toUpperCase()}]</span>
                      {log.memo && <div style={{ fontSize: '12px', color: '#9A9A9A', marginTop: '2px' }}>{log.memo}</div>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )

  return (
    <main style={pageStyle}>
      <BackgroundLayer />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '28px 18px' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '1.2px', margin: 0, marginBottom: '8px' }}>REPME | Admin Dashboard</h1>
            <p style={{ margin: 0, fontSize: '12px', color: '#9A9A9A' }}>全体統計＋個人サポート用表示</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => { fetchAdminData(); fetchAllAchievementStreaks() }} disabled={loading} style={smallButtonStyle}>{loading ? '更新中...' : '更新｜Refresh'}</button>
            <button onClick={handleLogout} style={smallButtonStyle}>ログアウト｜Logout</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {(['stats', 'users'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ ...smallButtonStyle, background: tab === t ? 'rgba(255,255,255,0.1)' : 'rgba(8,8,8,0.9)', borderColor: tab === t ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)' }}>
              {t === 'stats' ? '全体統計' : 'ユーザー一覧'}
            </button>
          ))}
        </div>

        {message && <section style={{ ...glassBox, marginBottom: '18px' }}><p style={{ margin: 0, fontSize: '13px', color: '#B8B8B8' }}>{message}</p></section>}

        {tab === 'stats' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '18px' }}>
              <Stat label="総ユーザー数｜Total Users" value={`${totalUsers}`} />
              <Stat label="総ログ数｜Logs" value={`${totalLogs}`} />
              <Stat label="総作業時間｜Total Minutes" value={`${totalMinutes}分`} />
              <Stat label="今日の作業時間｜Today" value={`${todayMinutes}分`} />
              <Stat label="今日のアクティブ｜Active Today" value={`${activeUsersToday}`} />
              <Stat label="直近7日アクティブ｜7D Active" value={`${activeUsers7Days}`} />
              <Stat label="平均作業時間/人｜Avg" value={`${averageMinutesPerUser}分`} />
              <Stat label="manual / realtime" value={`${manualRatio}% / ${realtimeRatio}%`} />
            </div>

            {/* 本日未作業 */}
            <section style={{ ...glassBox, marginBottom: '18px' }}>
              <div style={sectionLabel}>本日未作業｜No Activity Today　{noActivityToday.length}人</div>
              {loading ? <p style={emptyText}>読み込み中...</p>
                : noActivityToday.length === 0 ? <p style={emptyText}>全員作業済み</p>
                : (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {noActivityToday.map(u => {
                      const { leftLabel, leftColor, rightLabel, rightColor } = renderAbsentStatus(u)
                      return (
                        <div key={u.repme_code} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px', background: 'rgba(3,3,3,0.45)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: '#EAEAEA' }}>{u.display_name}</div>
                            <div style={{ fontSize: '12px', color: '#B8B8B8', marginTop: '2px' }}>
                              最終作業：{u.lastLogAt ? formatDate(u.lastLogAt) : '記録なし'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: leftColor }}>{leftLabel}</div>
                            <div style={{ fontSize: '12px', color: rightColor }}>{rightLabel}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '18px', marginBottom: '18px' }}>
              <section style={glassBox}>
                <div style={sectionLabel}>日別総作業時間｜Daily Total</div>
                {loading ? <p style={emptyText}>読み込み中...</p> : chartData.length === 0 ? <p style={emptyText}>データなし</p> : (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="date" stroke="#7A7A7A" tickLine={false} axisLine={false} />
                        <YAxis stroke="#7A7A7A" tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#EAEAEA' }} formatter={v => [`${v}分`, '合計']} />
                        <Bar dataKey="minutes" fill="#EAEAEA" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
              <section style={glassBox}>
                <div style={sectionLabel}>記録タイプ比率｜Type Split</div>
                {loading ? <p style={emptyText}>読み込み中...</p> : typeChartData.every(i => i.count === 0) ? <p style={emptyText}>データなし</p> : (
                  <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={typeChartData}>
                        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="name" stroke="#7A7A7A" tickLine={false} axisLine={false} />
                        <YAxis stroke="#7A7A7A" tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: '#111111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#EAEAEA' }} formatter={v => [`${v}件`, '件数']} />
                        <Bar dataKey="count" fill="#EAEAEA" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </section>
            </div>

            <section style={{ ...glassBox, marginBottom: '18px' }}>
              <div style={sectionLabel}>ユーザー状況｜User Activity</div>
              {loading ? <p style={emptyText}>読み込み中...</p> : userActivities.length === 0 ? <p style={emptyText}>データなし</p> : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {userActivities.map(user => (
                    <div key={user.code} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px', background: 'rgba(3,3,3,0.45)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#EAEAEA' }}>{displayNameMap[user.code] || user.code}</div>
                        <div style={{ fontSize: '12px', color: '#A0A0A0' }}>最終記録｜{user.lastLogAt ? new Date(user.lastLogAt).toLocaleDateString() : '-'}</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
                        <MiniStat label="総作業時間" value={`${user.totalMinutes}分`} />
                        <MiniStat label="記録日数" value={`${user.recordedDaysCount}日`} />
                        <MiniStat label="直近7日時間" value={`${user.last7DaysMinutes}分`} />
                        <MiniStat label="直近7日ログ" value={`${user.last7DaysLogCount}件`} />
                        <MiniStat label="REALTIME" value={`${user.realtimeCount}件`} />
                        <MiniStat label="MANUAL" value={`${user.manualCount}件`} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {tab === 'users' && (
          <section style={glassBox}>
            <div style={sectionLabel}>ユーザー一覧｜{users.length}人</div>
            {users.length === 0 ? <p style={emptyText}>ユーザーなし</p> : (
              <div>
                {users.map(user => {
                  const streak = achievementStreakMap[user.repme_code]
                  return (
                    <div key={user.repme_code}
                      onClick={() => fetchUserDetail(user)}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '12px 0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#EAEAEA' }}>{user.repme_code}</div>
                          {user.is_private && <div style={{ fontSize: '10px', color: '#6A6A6A', padding: '2px 6px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '999px' }}>非表示</div>}
                        </div>
                        {user.display_name && <div style={{ fontSize: '12px', color: '#B8B8B8', marginTop: '2px' }}>{user.display_name}</div>}
                        {user.user_id && <div style={{ fontSize: '11px', color: '#6A6A6A', marginTop: '2px' }}>{user.user_id}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* 目標時間連続達成日数 */}
                        <div style={{ textAlign: 'right' }}>
                          {streaksLoading ? (
                            <div style={{ fontSize: '11px', color: '#6A6A6A' }}>計算中...</div>
                          ) : streak != null ? (
                            <>
                              <div style={{ fontSize: '13px', fontWeight: 600, color: streak >= 3 ? '#7A9EC0' : '#EAEAEA' }}>
                                {streak}日連続達成
                              </div>
                              <div style={{ fontSize: '10px', color: '#6A6A6A' }}>目標時間連続達成</div>
                            </>
                          ) : (
                            <div style={{ fontSize: '11px', color: '#6A6A6A' }}>Start Plan未設定</div>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6A6A6A', whiteSpace: 'nowrap' }}>詳細 →</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  )
}

function BackgroundLayer() {
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(circle at 18% 18%, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 12%, transparent 34%), radial-gradient(circle at 82% 68%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 13%, transparent 34%), linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.06) 18%, transparent 28%), linear-gradient(315deg, transparent 0%, rgba(255,255,255,0.05) 20%, transparent 30%), repeating-linear-gradient(125deg, transparent 0px, transparent 10px, rgba(255,255,255,0.03) 11px, transparent 17px, transparent 28px), radial-gradient(rgba(255,255,255,0.08) 0.8px, transparent 1px)`, backgroundSize: `100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% 100%, 4px 4px`, opacity: 1 }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `linear-gradient(160deg, rgba(255,255,255,0.06), transparent 18%, transparent 78%, rgba(255,255,255,0.05)), radial-gradient(circle at 24% 26%, rgba(255,255,255,0.08), transparent 22%), radial-gradient(circle at 78% 70%, rgba(255,255,255,0.08), transparent 22%)`, filter: 'blur(22px)', opacity: 0.95 }} />
    </>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackgroundLayer />
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '420px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '22px', background: 'rgba(17,17,17,0.82)', backdropFilter: 'blur(10px)' }}>
          {children}
        </div>
      </div>
    </>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px', background: 'rgba(17,17,17,0.55)' }}>
      <div style={{ fontSize: '11px', color: '#8F8F8F', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#EAEAEA', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

const pageStyle: React.CSSProperties = { position: 'relative', minHeight: '100vh', overflow: 'hidden', background: '#030303', color: '#EAEAEA', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }
const loginTitle: React.CSSProperties = { fontSize: '28px', fontWeight: 700, letterSpacing: '1px', margin: 0, marginBottom: '8px' }
const loginSub: React.CSSProperties = { margin: 0, marginBottom: '16px', fontSize: '12px', color: '#9A9A9A', lineHeight: 1.5 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', background: 'rgba(8,8,8,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', color: '#EAEAEA', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
const loginButtonStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', background: '#EAEAEA', border: 'none', borderRadius: '10px', color: '#0A0A0A', cursor: 'pointer', fontSize: '14px', fontWeight: 700 }
const loginMessageStyle: React.CSSProperties = { margin: '12px 0 0', fontSize: '12px', color: '#B8B8B8', lineHeight: 1.5 }
const smallButtonStyle: React.CSSProperties = { width: 'auto', padding: '8px 12px', background: 'rgba(8,8,8,0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#EAEAEA', cursor: 'pointer', fontSize: '12px' }
const glassBox: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '14px', background: 'rgba(17,17,17,0.68)', backdropFilter: 'blur(6px)' }
const sectionLabel: React.CSSProperties = { fontSize: '12px', color: '#949494', marginBottom: '10px' }
const emptyText: React.CSSProperties = { fontSize: '13px', color: '#B8B8B8', margin: 0 }