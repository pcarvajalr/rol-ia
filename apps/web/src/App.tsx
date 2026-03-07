import { useEffect } from "react"
import { Routes, Route, Navigate } from "react-router"
import { useAuthStore } from "@/stores/auth-store"
import { LoginPage } from "@/pages/LoginPage"
import { DashboardPage } from "@/pages/DashboardPage"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { firebaseUser, loading } = useAuthStore()

  if (loading) {
    return (
      <div className="bg-background text-foreground flex h-screen items-center justify-center">
        <div className="text-muted-foreground text-sm">Cargando...</div>
      </div>
    )
  }
  if (!firebaseUser) return <Navigate to="/login" replace />
  return children
}

export function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    const unsubscribe = init()
    return unsubscribe
  }, [init])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
