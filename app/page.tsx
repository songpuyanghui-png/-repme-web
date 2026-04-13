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
}

type ScheduleTask = {
  id: number
  title?: string | null
  plan_type?: string | null
  scheduled_start_at?: string | null
  target_minutes?: number | null
  status?: string | null
  repme_code?: string | null
}

export default function Home() {
  const [logs, setLogs] = useState<WorkLog[]>([])
  const [todayTasks, setTodayTasks] = useState<ScheduleTask[]>([])
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

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingMinutes, setEditingMinutes] = useState('')
  const [updatingLog, setUpdatingLog] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const fetchLogs = useCallback(async () => {
    if (!isLoggedIn || !repmeCode) {
      setLogs([])
      setLoading(false)
      return
    }

    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('work_logs')
      .select('*')
      .eq('repme_code', repmeCode)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      setMessage('取得失敗｜Fetch failed')
      setLogs([])
      setLoading(false)
      return
    }

    setLogs(data || [])
    setLoading(false)
  }, [isLoggedIn, repmeCode])

  const fetchTodayTasks = useCallback(async () => {
    if (!isLoggedIn || !repmeCode) {
      setTodayTasks([])
      setTasksLoading(false)
      return
    }

    setTasksLoading(true)

    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const todayEnd = new Date()
      todayEnd.setHours(23, 59, 59, 999)

      const { data, error } = await supabase
        .from('schedule_tasks')
        .select('id, title, plan_type, scheduled_start_at, target_minutes, status, repme_code')
        .eq('repme_code', repmeCode)
        .gte('scheduled_start_at', todayStart.toISOString())
        .lte('scheduled_start_at', todayEnd.toISOString())
        .order('scheduled_start_at', { ascending: true })

      if (error) {
        console.error(error)
        setTodayTasks([])
        return
      }

      setTodayTasks(data || [])
    } catch (error) {
      console.error(error)
      setTodayTasks([])
    } finally {
      setTasksLoading(false)
    }
  }, [isLoggedIn, repmeCode])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    fetchTodayTasks()
  }, [fetchTodayTasks])

  const handleLogin = async () => {
    if (!repmeCode || !password) {
      setMessage('コードとパスワードを入力｜Enter code and password')
      return
    }

    setLoading(true)
    setMessage('')

    const code = repmeCode.trim().toUpperCase()

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('repme_code', code)
      .single()

    if (error || !data) {
      setMessage('ユーザーが存在しません｜User not found')
      setIsLoggedIn(false)
      setUserId('')
      setLoading(false)
      return
    }

    if (data.password !== password) {
      setMessage('パスワードが違います｜Wrong password')
      setIsLoggedIn(false)
      setUserId('')
      setLoading(false)
      return
    }

    setRepmeCode(code)
    setUserId(data.user_id || '')
    setIsLoggedIn(true)
    setMessage('')
    setLoading(false)
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
    setRepmeCode('')
    setPassword('')
    setUserId('')
    setLogs([])
    setTodayTasks([])
    setMessage('')
    setLoading(false)
    setTasksLoading(false)
    setManualMinutes('')
    setManualMemo('')
    setSavingManualLog(false)
    setEditingId(null)
    setEditingMinutes('')
    setUpdatingLog(false)
    setDeletingId(null)
  }

  const handleManualLogSubmit = async () => {
    if (!manualMinutes.trim()) {
      setMessage('時間を入力して｜Enter minutes')
      return
    }

    const minutesNumber = Number(manualMinutes)

    if (Number.isNaN(minutesNumber) || minutesNumber <= 0) {
      setMessage('時間は1以上の数字で入力｜Minutes must be 1 or more')
      return
    }

    if (!repmeCode) {
      setMessage('REPMEコードがありません｜No REPME code')
      return
    }

    if (!userId) {
      setMessage('user_id が見つかりません｜user_id not found')
      return
    }

    try {
      setSavingManualLog(true)
      setMessage('')

      const now = new Date().toISOString()

      const { error } = await supabase.from('work_logs').insert([
        {
          user_name: repmeCode,
          minutes: minutesNumber,
          memo: manualMemo.trim() || null,
          type: 'manual',
          repme_code: repmeCode,
          user_id: userId,
          start_time: now,
          end_time: now
        }
      ])

      if (error) {
        console.error(error)
        setMessage('手動記録の保存に失敗｜Manual log save failed')
        return
      }

      setManualMinutes('')
      setManualMemo('')
      setMessage('手動記録を保存しました｜Manual log saved')

      await fetchLogs()
      await fetchTodayTasks()
    } catch (error) {
      console.error(error)
      setMessage('エラーが発生しました｜Something went wrong')
    } finally {
      setSavingManualLog(false)
    }
  }

  const handleStartEdit = (log: WorkLog) => {
    setEditingId(log.id)
    setEditingMinutes(String(log.minutes ?? ''))
    setMessage('')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingMinutes('')
    setMessage('')
  }

  const handleUpdateMinutes = async (id: number) => {
    const minutesNumber = Number(editingMinutes)

    if (!editingMinutes.trim()) {
      setMessage('時間を入力して｜Enter minutes')
      return
    }

    if (Number.isNaN(minutesNumber) || minutesNumber <= 0) {
      setMessage('時間は1以上の数字で入力｜Minutes must be 1 or more')
      return
    }

    try {
      setUpdatingLog(true)
      setMessage('')

      const { error } = await supabase
        .from('work_logs')
        .update({ minutes: minutesNumber })
        .eq('id', id)
        .eq('repme_code', repmeCode)

      if (error) {
        console.error(error)
        setMessage('更新失敗｜Update failed')
        return
      }

      setEditingId(null)
      setEditingMinutes('')
      setMessage('時間を更新しました｜Minutes updated')

      await fetchLogs()
    } catch (error) {
      console.error(error)
      setMessage('エラーが発生しました｜Something went wrong')
    } finally {
      setUpdatingLog(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      setDeletingId(id)
      setMessage('')

      const { error } = await supabase
        .from('work_logs')
        .delete()
        .eq('id', id)
        .eq('repme_code', repmeCode)

      if (error) {
        console.error(error)
        setMessage('削除失敗｜Delete failed')
        return
      }

      if (editingId === id) {
        setEditingId(null)
        setEditingMinutes('')
      }

      setMessage('ログを削除しました｜Log deleted')
      await fetchLogs()
    } catch (error) {
      console.error(error)
      setMessage('エラーが発生しました｜Something went wrong')
    } finally {
      setDeletingId(null)
    }
  }

  const totalMinutes = useMemo(() => {
    return logs.reduce((sum, log) => sum + (log.minutes || 0), 0)
  }, [logs])

  const todayMinutes = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return logs.reduce((sum, log) => {
      const d = new Date(log.start_time || log.created_at)
      d.setHours(0, 0, 0, 0)
      return d.getTime() === today.getTime() ? sum + (log.minutes || 0) : sum
    }, 0)
  }, [logs])

  const weekMinutes = useMemo(() => {
    const today = new Date()
    const day = today.getDay()
    const diffFromMonday = day === 0 ? 6 : day - 1

    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - diffFromMonday)
    weekStart.setHours(0, 0, 0, 0)

    return logs.reduce((sum, log) => {
      const d = new Date(log.start_time || log.created_at)
      return d >= weekStart ? sum + (log.minutes || 0) : sum
    }, 0)
  }, [logs])

  const streak = useMemo(() => {
    if (logs.length === 0) return 0

    const dateSet = new Set(
      logs.map((log) => {
        const d = new Date(log.start_time || log.created_at)
        d.setHours(0, 0, 0, 0)
        return d.getTime()
      })
    )

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const hasToday = dateSet.has(today.getTime())
    const hasYesterday = dateSet.has(yesterday.getTime())

    if (!hasToday && !hasYesterday) return 0

    let count = 0
    const current = new Date(hasToday ? today : yesterday)

    while (dateSet.has(current.getTime())) {
      count++
      current.setDate(current.getDate() - 1)
    }

    return count
  }, [logs])

  const chartData = useMemo(() => {
    const grouped: Record<string, number> = {}

    logs
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
  }, [logs])

  return (
    <main
      style={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        background: '#030303',
        color: '#EAEAEA',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
      }}
    >
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

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: '980px',
          margin: '0 auto',
          padding: '28px 18px'
        }}
      >
        <h1
          style={{
            fontSize: '28px',
            fontWeight: 700,
            letterSpacing: '1.2px',
            marginBottom: '28px',
            textAlign: 'center'
          }}
        >
          REPME | Focus Gym
        </h1>

        {!isLoggedIn ? (
          <div
            style={{
              width: '100%',
              maxWidth: '360px',
              margin: '0 auto',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px',
              padding: '18px',
              background: 'rgba(17,17,17,0.72)',
              backdropFilter: 'blur(6px)'
            }}
          >
            <div
              style={{
                fontSize: '12px',
                color: '#9A9A9A',
                marginBottom: '14px'
              }}
            >
              ログイン｜Login
            </div>

            <input
              value={repmeCode}
              onChange={(e) => setRepmeCode(e.target.value)}
              placeholder="REPMEコード｜REPME Code"
              style={inputStyle}
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワード｜Password"
              style={inputStyle}
            />

            <button
              onClick={handleLogin}
              disabled={loading}
              style={buttonStyle}
            >
              {loading ? 'ログイン中｜Loading' : 'ログイン｜Login'}
            </button>

            {message && (
              <p
                style={{
                  color: '#B8B8B8',
                  marginTop: '12px',
                  fontSize: '12px',
                  lineHeight: 1.5
                }}
              >
                {message}
              </p>
            )}
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '14px',
                flexWrap: 'wrap'
              }}
            >
              <p
                style={{
                  fontSize: '12px',
                  color: '#9A9A9A',
                  margin: 0
                }}
              >
                現在のコード｜Current Code : {repmeCode}
              </p>

              <button
                onClick={handleLogout}
                style={{
                  padding: '8px 12px',
                  background: 'rgba(17,17,17,0.72)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px',
                  color: '#EAEAEA',
                  cursor: 'pointer',
                  fontSize: '12px',
                  backdropFilter: 'blur(6px)'
                }}
              >
                ログアウト｜Logout
              </button>
            </div>

            <section style={glassBox}>
              <div style={sectionLabel}>今日のtask｜Today&apos;s Tasks</div>

              {tasksLoading ? (
                <p style={emptyText}>読み込み中｜Loading</p>
              ) : todayTasks.length === 0 ? (
                <p style={emptyText}>今日のtaskはまだありません｜No tasks for today</p>
              ) : (
                <div>
                  {todayTasks.map((task) => (
                    <div
                      key={task.id}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.07)',
                        padding: '12px 0',
                        fontSize: '13px',
                        color: '#D8D8D8'
                      }}
                    >
                      <div
                        style={{
                          fontSize: '15px',
                          fontWeight: 600,
                          marginBottom: '6px',
                          color: '#EAEAEA'
                        }}
                      >
                        {task.title?.trim() ? task.title : '作業'}
                      </div>

                      <div style={{ fontSize: '12px', color: '#B8B8B8', lineHeight: 1.7 }}>
                        <div>Plan: {task.plan_type || '-'}</div>
                        <div>
                          Start:{' '}
                          {task.scheduled_start_at
                            ? new Date(task.scheduled_start_at).toLocaleString()
                            : '-'}
                        </div>
                        <div>Target: {task.target_minutes ?? 0}分</div>
                      </div>

                      <div
                        style={{
                          display: 'inline-block',
                          fontSize: '11px',
                          color: '#8F8F8F',
                          marginTop: '8px',
                          padding: '3px 7px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '999px',
                          background: 'rgba(255,255,255,0.03)'
                        }}
                      >
                        STATUS: {task.status || 'planned'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '10px',
                marginBottom: '18px'
              }}
            >
              <Stat label="合計時間｜Total" value={`${totalMinutes}分`} />
              <Stat label="今日｜Today" value={`${todayMinutes}分`} />
              <Stat label="今週｜This Week" value={`${weekMinutes}分`} />
              <Stat label="連続日数｜Streak" value={`${streak}日`} />
            </div>

            <section style={glassBox}>
              <div style={sectionLabel}>手動記録｜Manual Log</div>

              <div style={{ display: 'grid', gap: '10px' }}>
                <input
                  type="number"
                  min="1"
                  value={manualMinutes}
                  onChange={(e) => setManualMinutes(e.target.value)}
                  placeholder="時間（分）｜Minutes"
                  style={inputStyle}
                />

                <textarea
                  value={manualMemo}
                  onChange={(e) => setManualMemo(e.target.value)}
                  placeholder="メモ（任意）｜Memo (optional)"
                  rows={3}
                  style={textareaStyle}
                />

                <button
                  onClick={handleManualLogSubmit}
                  disabled={savingManualLog}
                  style={buttonStyle}
                >
                  {savingManualLog ? '保存中｜Saving' : '保存する｜Save'}
                </button>
              </div>
            </section>

            <section style={glassBox}>
              <div style={sectionLabel}>日別作業｜Daily Work</div>

              {loading ? (
                <p style={emptyText}>読み込み中｜Loading</p>
              ) : chartData.length === 0 ? (
                <p style={emptyText}>データなし｜No data</p>
              ) : (
                <div style={{ width: '100%', height: 240 }}>
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
                        formatter={(value) => [`${value}分`, '作業時間｜Work']}
                      />
                      <Bar dataKey="minutes" fill="#EAEAEA" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section style={glassBox}>
              <div style={sectionLabel}>作業ログ｜Work Logs</div>

              {message && (
                <p
                  style={{
                    color: '#B8B8B8',
                    marginBottom: '10px',
                    fontSize: '12px'
                  }}
                >
                  {message}
                </p>
              )}

              {loading ? (
                <p style={emptyText}>読み込み中｜Loading</p>
              ) : logs.length === 0 ? (
                <p style={emptyText}>ログがまだありません｜No logs yet</p>
              ) : (
                <div>
                  {logs.map((log) => {
                    const isEditing = editingId === log.id
                    const typeLabel = log.type === 'manual' ? '[MANUAL]' : '[REALTIME]'

                    return (
                      <div
                        key={log.id}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.07)',
                          padding: '12px 0',
                          fontSize: '13px',
                          color: '#D8D8D8'
                        }}
                      >
                        {isEditing ? (
                          <div style={{ marginBottom: '8px' }}>
                            <input
                              type="number"
                              min="1"
                              value={editingMinutes}
                              onChange={(e) => setEditingMinutes(e.target.value)}
                              placeholder="時間（分）｜Minutes"
                              style={{
                                ...inputStyle,
                                marginBottom: '8px'
                              }}
                            />

                            <div
                              style={{
                                display: 'flex',
                                gap: '8px',
                                flexWrap: 'wrap'
                              }}
                            >
                              <button
                                onClick={() => handleUpdateMinutes(log.id)}
                                disabled={updatingLog}
                                style={{
                                  ...smallButtonStyle,
                                  opacity: updatingLog ? 0.7 : 1,
                                  cursor: updatingLog ? 'default' : 'pointer'
                                }}
                              >
                                {updatingLog ? '保存中｜Saving' : '保存｜Save'}
                              </button>

                              <button
                                onClick={handleCancelEdit}
                                disabled={updatingLog}
                                style={{
                                  ...smallButtonStyle,
                                  opacity: updatingLog ? 0.7 : 1,
                                  cursor: updatingLog ? 'default' : 'pointer'
                                }}
                              >
                                キャンセル｜Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginBottom: '4px' }}>
                            {log.minutes ?? 0}分｜
                            {new Date(
                              log.start_time || log.created_at
                            ).toLocaleDateString()}
                          </div>
                        )}

                        <div
                          style={{
                            display: 'inline-block',
                            fontSize: '11px',
                            color: '#8F8F8F',
                            marginBottom: log.memo ? '6px' : '8px',
                            padding: '3px 7px',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '999px',
                            background: 'rgba(255,255,255,0.03)'
                          }}
                        >
                          {typeLabel}
                        </div>

                        {log.memo && (
                          <div
                            style={{
                              fontSize: '12px',
                              color: '#B8B8B8',
                              lineHeight: 1.5,
                              marginBottom: '8px'
                            }}
                          >
                            {log.memo}
                          </div>
                        )}

                        {!isEditing && (
                          <div
                            style={{
                              display: 'flex',
                              gap: '8px',
                              flexWrap: 'wrap'
                            }}
                          >
                            <button
                              onClick={() => handleStartEdit(log)}
                              style={smallButtonStyle}
                            >
                              編集｜Edit
                            </button>

                            <button
                              onClick={() => handleDelete(log.id)}
                              disabled={deletingId === log.id}
                              style={{
                                ...smallButtonStyle,
                                opacity: deletingId === log.id ? 0.7 : 1,
                                cursor: deletingId === log.id ? 'default' : 'pointer'
                              }}
                            >
                              {deletingId === log.id ? '削除中｜Deleting' : '削除｜Delete'}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
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

const inputStyle: React.CSSProperties = {
  width: '100%',
  marginBottom: '10px',
  padding: '10px 12px',
  background: 'rgba(3,3,3,0.88)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px',
  color: '#EAEAEA',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box'
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  marginBottom: '10px',
  padding: '10px 12px',
  background: 'rgba(3,3,3,0.88)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px',
  color: '#EAEAEA',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  resize: 'vertical'
}

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(8,8,8,0.9)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px',
  color: '#EAEAEA',
  cursor: 'pointer',
  fontSize: '14px'
}

const smallButtonStyle: React.CSSProperties = {
  width: 'auto',
  padding: '7px 10px',
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
  backdropFilter: 'blur(6px)',
  marginBottom: '18px'
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