'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AddLog() {
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState('')

  const handleAdd = async () => {
    if (!name || !minutes) return

    const { error } = await supabase.from('work_logs').insert([
      {
        user_name: name,
        minutes: Number(minutes),
      },
    ])

    if (error) {
      alert('エラー: ' + error.message)
    } else {
      alert('追加成功')
      location.reload()
    }
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <input
        placeholder="名前"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ marginRight: '8px' }}
      />
      <input
        placeholder="時間（分）"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        style={{ marginRight: '8px' }}
      />
      <button onClick={handleAdd}>追加</button>
    </div>
  )
}