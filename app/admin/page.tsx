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

export default function AdminPage() {
  const [isAuthed, setIsAuthed] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginMessage, setLoginMessage] = useState('')

  const [logs, setLogs] = useState<WorkLog[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // ユーザー詳細
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [userTasks, setUserTasks] = useState<ScheduleTask[]>([])
  const [userLogsDetail, setUserLogsDetail] = useState<WorkLog[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  // タブ
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
  }, [])

  const fetchAdminData = useCallback(async () => {
    if (!isAuthed) return
    try {
      setLoading(true); setMessage('')
      const [{ data: logsData, error: logsError }, { data: usersData, error: usersError }] = await Promise.all([
        supabase.from('work_logs').select('*').order('created_at', { ascending: false }),
        supabase.from('users').select('*')
      ])
      if (logsError) { console.error(logsError); setMessage('ログ取得失敗'); setLogs([]) }
      else setLogs(logsData || [])
      if (usersError) { console.error(usersError); setUsers([]) }
      else setUsers(usersData || [])
    } catch { setMessage('エラーが発生しました') }
    finally { setLoading(false) }
  }, [isAuthed])

  const fetchUserDetail = useCallback(async (user: UserRow) => {
    setDetailLoading(true)
    setSelectedUser(user)

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
    setDetailLoading(false)
  }, [])

  useEffect(() => { checkAuth() }, [checkAuth])
  useEffect(() => { if (isAuthed) fetchAdminData() }, [isAuthed, fetchAdminData])

  const displayNameMap = useMemo(() => {
    const map: Record<string, string> = {}
    users.forEach(u => { map[u.repme_code] = u.display_name || u.repme_code })
    return map
  }, [users])

  const visibleUsers = useMemo(() => users.filter(u => !u.is_private), [users])
  const visibleUserCodes = useMemo(() => new Set(visibleUsers.map(u => u.repme_code)), [visibleUsers])
  const visibleLogs = useMemo(() => logs.filter(l => l.repme_code && visibleUserCodes.has(l.repme_code)), [logs, visibleUserCodes])

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
      const d = new Date(l.start_time || l.created_at)
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

  // ユーザー詳細画面
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
            {/* schedule_tasks */}
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

            {/* work_logs全件 */}
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

  // メイン画面
  return (
    <main style={pageStyle}>
      <BackgroundLayer />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '28px 18px' }}>

        {/* ヘッダー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '30px', fontWeight: 700, letterSpacing: '1.2px', margin: 0, marginBottom: '8px' }}>REPME | Admin Dashboard</h1>
            <p style={{ margin: 0, fontSize: '12px', color: '#9A9A9A' }}>全体統計＋個人サポート用表示</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={fetchAdminData} disabled={loading} style={smallButtonStyle}>{loading ? '更新中...' : '更新｜Refresh'}</button>
            <button onClick={handleLogout} style={smallButtonStyle}>ログアウト｜Logout</button>
          </div>
        </div>

        {/* タブ */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {(['stats', 'users'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ ...smallButtonStyle, background: tab === t ? 'rgba(255,255,255,0.1)' : 'rgba(8,8,8,0.9)', borderColor: tab === t ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)' }}>
              {t === 'stats' ? '全体統計' : 'ユーザー一覧'}
            </button>
          ))}
        </div>

        {message && <section style={{ ...glassBox, marginBottom: '18px' }}><p style={{ margin: 0, fontSize: '13px', color: '#B8B8B8' }}>{message}</p></section>}

        {/* 全体統計タブ */}
        {tab === 'stats' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '18px' }}>
              <Stat label="表示対象ユーザー数｜Visible Users" value={`${totalUsers}`} />
              <Stat label="総ログ数｜Logs" value={`${totalLogs}`} />
              <Stat label="総作業時間｜Total Minutes" value={`${totalMinutes}分`} />
              <Stat label="今日の作業時間｜Today" value={`${todayMinutes}分`} />
              <Stat label="今日のアクティブ｜Active Today" value={`${activeUsersToday}`} />
              <Stat label="直近7日アクティブ｜7D Active" value={`${activeUsers7Days}`} />
              <Stat label="平均作業時間/人｜Avg" value={`${averageMinutesPerUser}分`} />
              <Stat label="manual / realtime" value={`${manualRatio}% / ${realtimeRatio}%`} />
            </div>

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

        {/* ユーザー一覧タブ */}
        {tab === 'users' && (
          <section style={glassBox}>
            <div style={sectionLabel}>ユーザー一覧｜{users.length}人（非表示含む）</div>
            {users.length === 0 ? <p style={emptyText}>ユーザーなし</p> : (
              <div>
                {users.map(user => (
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
                    <div style={{ fontSize: '12px', color: '#6A6A6A', whiteSpace: 'nowrap' }}>詳細 →</div>
                  </div>
                ))}
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