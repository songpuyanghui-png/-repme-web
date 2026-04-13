import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = 'repme_admin_session'

export async function GET() {
  const cookieStore = await cookies()
  const session = cookieStore.get(COOKIE_NAME)?.value

  if (session === 'ok') {
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false }, { status: 401 })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const password = String(body?.password || '')
    const adminPassword = process.env.ADMIN_PASSWORD

    console.log('input password:', password)
    console.log('ADMIN_PASSWORD:', adminPassword)
    console.log('matched:', password === adminPassword)

    if (!adminPassword) {
      return NextResponse.json(
        { ok: false, message: 'ADMIN_PASSWORD is not set' },
        { status: 500 }
      )
    }

    if (password !== adminPassword) {
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const response = NextResponse.json({ ok: true })

    response.cookies.set(COOKIE_NAME, 'ok', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12
    })

    return response
  } catch (error) {
    console.error(error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}