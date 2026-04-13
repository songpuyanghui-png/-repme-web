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
  user_name: string | null
  minutes: number | null
  created_at: string
  repme_code?: string | null
  start_time?: string | null
  end_time?: string | null
  type?: string | null
  memo?: string | null
  user_id?: string | null
}

type UserRow = {
  repme_code: string
  password: string
  user_id?: string | null
  is_private?: boolean | null
  display_name?: string | null
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

  const displayNameMap = useMemo(() => {
    const map: Record<string, string> = {}

    users.forEach((user) => {
      map[user.repme_code] = user.display_name || user.repme_code
    })

    return map
  }, [users])

  const checkAuth = useCallback(async () => {
    try {
      setCheckingAuth(true)
      const res = await fetch('/api/admin-login', { method: 'GET' })
      const data = await res.json()
      setIsAuthed(Boolean(data.ok))
    } catch (error) {
      console.error(error)
      setIsAuthed(false)
    } finally {
      setCheckingAuth(false)
    }
  }, [])

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      try {
        setLoginLoading(true)
        setLoginMessage('')

        const res = await fetch('/api/admin-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ password })
        })

        const data = await res.json()

        if (!res.ok || !data.ok) {
          setLoginMessage('パスワードが違う｜Invalid password')
          setIsAuthed(false)
          return
        }

        setIsAuthed(true)
        setPassword('')
      } catch (error) {
        console.error(error)
        setLoginMessage('ログイン失敗｜Login failed')
        setIsAuthed(false)
      } finally {
        setLoginLoading(false)
      }
    },
    [password]
  )

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/admin-logout', { method: 'POST' })
      setIsAuthed(false)
      setLogs([])
      setUsers([])
      setMessage('')
    } catch (error) {
      console.error(error)
    }
  }, [])

  const fetchAdminData = useCallback(async () => {
    if (!isAuthed) return

    try {
      setLoading(true)
      setMessage('')

      const [{ data: logsData, error: logsError }, { data: usersData, error: usersError }] =
        await Promise.all([
          supabase.from('work_logs').select('*').order('created_at', { ascending: false }),
          supabase.from('users').select('*')
        ])

      if (logsError) {
        console.error(logsError)
        setMessage('ログ取得失敗｜Failed to fetch logs')
        setLogs([])
      } else {
        setLogs(logsData || [])
      }

      if (usersError) {
        console.error(usersError)
        setMessage((prev) =>
          prev
            ? `${prev} / ユーザー取得失敗｜Failed to fetch users`
            : 'ユーザー取得失敗｜Failed to fetch users'
        )
        setUsers([])
      } else {
        setUsers(usersData || [])
      }
    } catch (error) {
      console.error(error)
      setMessage('エラーが発生しました｜Something went wrong')
      setLogs([])
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [isAuthed])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (isAuthed) {
      fetchAdminData()
    }
  }, [isAuthed, fetchAdminData])

  const visibleUsers = useMemo(() => {
    return users.filter((user) => !user.is_private)
  }, [users])

  const visibleUserCodes = useMemo(() => {
    return new Set(visibleUsers.map((user) => user.repme_code))
  }, [visibleUsers])

  const visibleLogs = useMemo(() => {
    return logs.filter((log) => {
      if (!log.repme_code) return false
      return visibleUserCodes.has(log.repme_code)
    })
  }, [logs, visibleUserCodes])

  const totalMinutes = useMemo(() => {
    return visibleLogs.reduce((sum, log) => sum + (log.minutes || 0), 0)
  }, [visibleLogs])

  const totalLogs = useMemo(() => {
    return visibleLogs.length
  }, [visibleLogs])

  const totalUsers = useMemo(() => {
    return visibleUsers.length
  }, [visibleUsers])

  const todayLogs = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return visibleLogs.filter((log) => {
      const d = new Date(log.start_time || log.created_at)
      d.setHours(0, 0, 0, 0)
      return d.getTime() === today.getTime()
    })
  }, [visibleLogs])

  const todayMinutes = useMemo(() => {
    return todayLogs.reduce((sum, log) => sum + (log.minutes || 0), 0)
  }, [todayLogs])

  const activeUsersToday = useMemo(() => {
    const set = new Set(
      todayLogs
        .map((log) => log.repme_code)
        .filter((code): code is string => Boolean(code))
    )
    return set.size
  }, [todayLogs])

  const logsLast7Days = useMemo(() => {
    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(now.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    return visibleLogs.filter((log) => {
      const d = new Date(log.start_time || log.created_at)
      return d >= sevenDaysAgo
    })
  }, [visibleLogs])

  const activeUsers7Days = useMemo(() => {
    const set = new Set(
      logsLast7Days
        .map((log) => log.repme_code)
        .filter((code): code is string => Boolean(code))
    )
    return set.size
  }, [logsLast7Days])

  const averageMinutesPerUser = useMemo(() => {
    if (activeUsers7Days === 0) return 0
    const total = logsLast7Days.reduce((sum, log) => sum + (log.minutes || 0), 0)
    return Math.round(total / activeUsers7Days)
  }, [logsLast7Days, activeUsers7Days])

  const manualCount = useMemo(() => {
    return visibleLogs.filter((log) => log.type === 'manual').length
  }, [visibleLogs])

  const realtimeCount = useMemo(() => {
    return visibleLogs.filter((log) => log.type !== 'manual').length
  }, [visibleLogs])

  const manualRatio = useMemo(() => {
    if (visibleLogs.length === 0) return 0
    return Math.round((manualCount / visibleLogs.length) * 100)
  }, [manualCount, visibleLogs.length])

  const realtimeRatio = useMemo(() => {
    if (visibleLogs.length === 0) return 0
    return Math.round((realtimeCount / visibleLogs.length) * 100)
  }, [realtimeCount, visibleLogs.length])

  const chartData = useMemo(() => {
    const grouped: Record<string, number> = {}

    visibleLogs
      .slice()
      .reverse()
      .forEach((log) => {
        const baseDate = log.start_time || log.created_at
        const date = new Date(baseDate)
        const key = `${date.getMonth() + 1}/${date.getDate()}`
        grouped[key] = (grouped[key] || 0) + (log.minutes || 0)
      })

    return Object.entries(grouped).map(([date, minutes]) => ({
      date,
      minutes
    }))
  }, [visibleLogs])

  const typeChartData = useMemo(() => {
    return [
      { name: 'REALTIME', count: realtimeCount },
      { name: 'MANUAL', count: manualCount }
    ]
  }, [realtimeCount, manualCount])

  const userActivities = useMemo<UserActivity[]>(() => {
    const map: Record<
      string,
      {
        totalMinutes: number
        lastLogAt: string | null
        recordedDayKeys: Set<string>
        last7DaysMinutes: number
        last7DaysLogCount: number
        realtimeCount: number
        manualCount: number
      }
    > = {}

    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(now.getDate() - 6)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    visibleLogs.forEach((log) => {
      if (!log.repme_code) return

      if (!map[log.repme_code]) {
        map[log.repme_code] = {
          totalMinutes: 0,
          lastLogAt: null,
          recordedDayKeys: new Set<string>(),
          last7DaysMinutes: 0,
          last7DaysLogCount: 0,
          realtimeCount: 0,
          manualCount: 0
        }
      }

      const baseDate = log.start_time || log.created_at
      const d = new Date(baseDate)
      const dayKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

      map[log.repme_code].totalMinutes += log.minutes || 0
      map[log.repme_code].recordedDayKeys.add(dayKey)

      if (!map[log.repme_code].lastLogAt || d > new Date(map[log.repme_code].lastLogAt!)) {
        map[log.repme_code].lastLogAt = baseDate
      }

      if (d >= sevenDaysAgo) {
        map[log.repme_code].last7DaysMinutes += log.minutes || 0
        map[log.repme_code].last7DaysLogCount += 1
      }

      if (log.type === 'manual') {
        map[log.repme_code].manualCount += 1
      } else {
        map[log.repme_code].realtimeCount += 1
      }
    })

    return Object.entries(map)
      .map(([code, value]) => ({
        code,
        totalMinutes: value.totalMinutes,
        lastLogAt: value.lastLogAt,
        recordedDaysCount: value.recordedDayKeys.size,
        last7DaysMinutes: value.last7DaysMinutes,
        last7DaysLogCount: value.last7DaysLogCount,
        realtimeCount: value.realtimeCount,
        manualCount: value.manualCount
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
  }, [visibleLogs])

  if (checkingAuth) {
    return (
      <main style={pageStyle}>
        <CenteredCard>
          <h1 style={loginTitle}>REPME | Admin</h1>
          <p style={loginSub}>確認中｜Checking access...</p>
        </CenteredCard>
      </main>
    )
  }

  if (!isAuthed) {
    return (
      <main style={pageStyle}>
        <BackgroundLayer />
        <CenteredCard>
          <h1 style={loginTitle}>REPME | Admin Login</h1>
          <p style={loginSub}>管理者専用ページ｜Admin only</p>

          <form onSubmit={handleLogin} style={{ display: 'grid', gap: '10px' }}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="管理者パスワード｜Admin Password"
              style={inputStyle}
              autoComplete="current-password"
            />

            <button type="submit" disabled={loginLoading} style={loginButtonStyle}>
              {loginLoading ? 'ログイン中｜Signing in...' : 'ログイン｜Login'}
            </button>
          </form>

          {loginMessage && <p style={loginMessageStyle}>{loginMessage}</p>}
        </CenteredCard>
      </main>
    )
  }

  return (
    <main style={pageStyle}>
      <BackgroundLayer />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '28px 18px'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '24px'
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '30px',
                fontWeight: 700,
                letterSpacing: '1.2px',
                margin: 0,
                marginBottom: '8px'
              }}
            >
              REPME | Admin Dashboard
            </h1>

            <p
              style={{
                margin: 0,
                fontSize: '12px',
                color: '#9A9A9A',
                lineHeight: 1.5
              }}
            >
              全体統計＋個人サポート用表示｜Aggregate stats + user support view
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={fetchAdminData} disabled={loading} style={smallButtonStyle}>
              {loading ? '更新中｜Refreshing' : '更新｜Refresh'}
            </button>
            <button onClick={handleLogout} style={smallButtonStyle}>
              ログアウト｜Logout
            </button>
          </div>
        </div>

        {message && (
          <section style={{ ...glassBox, marginBottom: '18px' }}>
            <p
              style={{
                margin: 0,
                fontSize: '13px',
                color: '#B8B8B8',
                lineHeight: 1.5
              }}
            >
              {message}
            </p>
          </section>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '10px',
            marginBottom: '18px'
          }}
        >
          <Stat label="表示対象ユーザー数｜Visible Users" value={`${totalUsers}`} />
          <Stat label="総ログ数｜Logs" value={`${totalLogs}`} />
          <Stat label="総作業時間｜Total Minutes" value={`${totalMinutes}分`} />
          <Stat label="今日の作業時間｜Today Minutes" value={`${todayMinutes}分`} />
          <Stat label="今日のアクティブ人数｜Active Today" value={`${activeUsersToday}`} />
          <Stat label="直近7日アクティブ人数｜Active 7D" value={`${activeUsers7Days}`} />
          <Stat label="平均作業時間/人｜Avg Per Active User" value={`${averageMinutesPerUser}分`} />
          <Stat label="manual / realtime" value={`${manualRatio}% / ${realtimeRatio}%`} />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr',
            gap: '18px',
            marginBottom: '18px'
          }}
        >
          <section style={glassBox}>
            <div style={sectionLabel}>日別総作業時間｜Daily Total Minutes</div>

            {loading ? (
              <p style={emptyText}>読み込み中｜Loading</p>
            ) : chartData.length === 0 ? (
              <p style={emptyText}>データなし｜No data</p>
            ) : (
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="date" stroke="#7A7A7A" tickLine={false} axisLine={false} />
                    <YAxis stroke="#7A7A7A" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111111',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        color: '#EAEAEA'
                      }}
                      formatter={(value) => [`${value}分`, '合計｜Total']}
                    />
                    <Bar dataKey="minutes" fill="#EAEAEA" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section style={glassBox}>
            <div style={sectionLabel}>記録タイプ比率｜Type Split</div>

            {loading ? (
              <p style={emptyText}>読み込み中｜Loading</p>
            ) : typeChartData.every((item) => item.count === 0) ? (
              <p style={emptyText}>データなし｜No data</p>
            ) : (
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={typeChartData}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="name" stroke="#7A7A7A" tickLine={false} axisLine={false} />
                    <YAxis stroke="#7A7A7A" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#111111',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        color: '#EAEAEA'
                      }}
                      formatter={(value) => [`${value}件`, '件数｜Count']}
                    />
                    <Bar dataKey="count" fill="#EAEAEA" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>

        <section style={{ ...glassBox, marginBottom: '18px' }}>
          <div style={sectionLabel}>ユーザー状況｜User Activity</div>

          {loading ? (
            <p style={emptyText}>読み込み中｜Loading</p>
          ) : userActivities.length === 0 ? (
            <p style={emptyText}>データなし｜No data</p>
          ) : (
            <div style={{ display: 'grid', gap: '10px' }}>
              {userActivities.map((user) => (
                <div
                  key={user.code}
                  style={{
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px',
                    padding: '12px',
                    background: 'rgba(3,3,3,0.45)'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      flexWrap: 'wrap',
                      marginBottom: '8px'
                    }}
                  >
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#EAEAEA'
                      }}
                    >
                      {displayNameMap[user.code] || user.code}
                    </div>

                    <div
                      style={{
                        fontSize: '12px',
                        color: '#A0A0A0'
                      }}
                    >
                      最終記録｜
                      {user.lastLogAt
                        ? new Date(user.lastLogAt).toLocaleDateString()
                        : '-'}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '8px'
                    }}
                  >
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

        <section style={glassBox}>
          <div style={sectionLabel}>管理メモ｜Admin Notes</div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '10px'
            }}
          >
            <MiniInfo
              title="見えるもの"
              text="REPMEコード、時間、回数、最終記録日だけを表示。memoの内容は表示しない。"
            />
            <MiniInfo
              title="非表示ユーザー"
              text="usersテーブルで is_private = true の人は個人一覧から除外する。"
            />
            <MiniInfo
              title="運用の軸"
              text="監視ではなくサポート。継続が止まりそうな人を早めに拾うために使う。"
            />
          </div>
        </section>
      </div>
    </main>
  )
}

function BackgroundLayer() {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `
            radial-gradient(circle at 18% 18%, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 12%, transparent 34%),
            radial-gradient(circle at 82% 68%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 13%, transparent 34%),
            linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.06) 18%, transparent 28%),
            linear-gradient(315deg, transparent 0%, rgba(255,255,255,0.05) 20%, transparent 30%),
            repeating-linear-gradient(
              125deg,
              transparent 0px,
              transparent 10px,
              rgba(255,255,255,0.03) 11px,
              transparent 17px,
              transparent 28px
            ),
            radial-gradient(rgba(255,255,255,0.08) 0.8px, transparent 1px)
          `,
          backgroundSize: `
            100% 100%,
            100% 100%,
            100% 100%,
            100% 100%,
            100% 100%,
            4px 4px
          `,
          opacity: 1
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `
            linear-gradient(160deg, rgba(255,255,255,0.06), transparent 18%, transparent 78%, rgba(255,255,255,0.05)),
            radial-gradient(circle at 24% 26%, rgba(255,255,255,0.08), transparent 22%),
            radial-gradient(circle at 78% 70%, rgba(255,255,255,0.08), transparent 22%)
          `,
          filter: 'blur(22px)',
          opacity: 0.95
        }}
      />
    </>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackgroundLayer />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '20px'
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '420px',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '14px',
            padding: '22px',
            background: 'rgba(17,17,17,0.82)',
            backdropFilter: 'blur(10px)'
          }}
        >
          {children}
        </div>
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px',
        padding: '12px 12px 11px',
        background: 'rgba(17,17,17,0.68)',
        backdropFilter: 'blur(6px)'
      }}
    >
      <div
        style={{
          fontSize: '11px',
          color: '#949494',
          marginBottom: '5px',
          lineHeight: 1.4
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: '18px',
          fontWeight: 600,
          lineHeight: 1.2,
          color: '#EAEAEA'
        }}
      >
        {value}
      </div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        padding: '10px',
        background: 'rgba(17,17,17,0.55)'
      }}
    >
      <div
        style={{
          fontSize: '11px',
          color: '#8F8F8F',
          marginBottom: '4px'
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '13px',
          color: '#EAEAEA',
          fontWeight: 600
        }}
      >
        {value}
      </div>
    </div>
  )
}

function MiniInfo({ title, text }: { title: string; text: string }) {
  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px',
        padding: '12px',
        background: 'rgba(3,3,3,0.5)'
      }}
    >
      <div
        style={{
          fontSize: '12px',
          color: '#EAEAEA',
          fontWeight: 600,
          marginBottom: '6px'
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: '12px',
          color: '#A8A8A8',
          lineHeight: 1.6
        }}
      >
        {text}
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: '100vh',
  overflow: 'hidden',
  background: '#030303',
  color: '#EAEAEA',
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
}

const loginTitle: React.CSSProperties = {
  fontSize: '28px',
  fontWeight: 700,
  letterSpacing: '1px',
  margin: 0,
  marginBottom: '8px'
}

const loginSub: React.CSSProperties = {
  margin: 0,
  marginBottom: '16px',
  fontSize: '12px',
  color: '#9A9A9A',
  lineHeight: 1.5
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: 'rgba(8,8,8,0.92)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '10px',
  color: '#EAEAEA',
  fontSize: '14px',
  outline: 'none'
}

const loginButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: '#EAEAEA',
  border: 'none',
  borderRadius: '10px',
  color: '#0A0A0A',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 700
}

const loginMessageStyle: React.CSSProperties = {
  margin: '12px 0 0',
  fontSize: '12px',
  color: '#B8B8B8',
  lineHeight: 1.5
}

const smallButtonStyle: React.CSSProperties = {
  width: 'auto',
  padding: '8px 12px',
  background: 'rgba(8,8,8,0.9)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px',
  color: '#EAEAEA',
  cursor: 'pointer',
  fontSize: '12px'
}

const glassBox: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '10px',
  padding: '14px',
  background: 'rgba(17,17,17,0.68)',
  backdropFilter: 'blur(6px)'
}

const sectionLabel: React.CSSProperties = {
  fontSize: '12px',
  color: '#949494',
  marginBottom: '10px'
}

const emptyText: React.CSSProperties = {
  fontSize: '13px',
  color: '#B8B8B8',
  margin: 0
}