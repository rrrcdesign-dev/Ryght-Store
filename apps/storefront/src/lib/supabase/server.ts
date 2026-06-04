import { createClient } from "@supabase/supabase-js"

/**
 * Server-side Supabase client.
 * Use this in Next.js Server Components, Route Handlers, and Server Actions.
 * This client uses the publishable key and does NOT have elevated privileges.
 * For admin operations requiring the service role key, that key should only
 * be used server-side and kept out of the repository.
 */
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase environment variables. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set."
    )
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
    },
  })
}
