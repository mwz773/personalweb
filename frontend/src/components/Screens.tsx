import type { ReactNode } from 'react'

export function SetupScreen() {
  return <main className="setup-shell"><section className="setup-card"><p className="eyebrow">Setup needed</p><h1>Your portfolio starter is ready.</h1><p>Connect it to Supabase to turn this into a live, database-backed portfolio.</p></section></main>
}

export function StatusScreen({ title = 'One moment', message, detail }: { title?: string; message: string; detail?: ReactNode }) {
  return <section className="status-screen" aria-live="polite"><p className="eyebrow">{title}</p><h1>{message}</h1>{detail ? <p>{detail}</p> : null}</section>
}
