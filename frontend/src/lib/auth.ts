import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type { Session }

export async function getSession(): Promise<Session | null> {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  return data.session
}

export async function signIn(email: string, password: string): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    throw error
  }
}

export async function signOut(): Promise<void> {
  if (!supabase) {
    return
  }

  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
}
