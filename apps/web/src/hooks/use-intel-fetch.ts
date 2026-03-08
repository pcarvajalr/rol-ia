import { useState, useEffect } from "react"
import { useAuthStore } from "@/stores/auth-store"

const API_URL = import.meta.env.VITE_API_URL || ""

export function useIntelFetch<T>(path: string, defaultValue: T): { data: T; loading: boolean } {
  const token = useAuthStore((s) => s.token)
  const [data, setData] = useState<T>(defaultValue)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    let cancelled = false

    fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed")
        return res.json()
      })
      .then((json) => {
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [path, token])

  return { data, loading }
}
