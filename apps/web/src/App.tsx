import { useEffect } from "react"
import { Routes, Route, Navigate } from "react-router"
import { useAuthStore } from "@/stores/auth-store"
import { LoginPage } from "@/pages/LoginPage"
import { RegisterPage } from "@/pages/RegisterPage"
import { VerifyEmailPage } from "@/pages/VerifyEmailPage"
import { PendingApprovalPage } from "@/pages/PendingApprovalPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { AdminLayout } from "@/pages/admin/AdminLayout"
import { PendingUsersPage } from "@/pages/admin/PendingUsersPage"
import { TenantsPage } from "@/pages/admin/TenantsPage"

export function App() {
  const init = useAuthStore((s) => s.init)
  const authStatus = useAuthStore((s) => s.authStatus)

  useEffect(() => {
    const unsubscribe = init()
    return unsubscribe
  }, [init])

  if (authStatus === "loading") {
    return (
      <div className="bg-background text-foreground flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="border-aura/30 border-t-aura h-8 w-8 animate-spin rounded-full border-2" />
          <span className="text-muted-foreground text-sm">Cargando...</span>
        </div>
      </div>
    )
  }

  if (authStatus === "unauthenticated") {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (authStatus === "pending_verification") {
    return (
      <Routes>
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="*" element={<Navigate to="/verify-email" replace />} />
      </Routes>
    )
  }

  if (authStatus === "pending_approval") {
    return (
      <Routes>
        <Route path="/pending-approval" element={<PendingApprovalPage />} />
        <Route
          path="*"
          element={<Navigate to="/pending-approval" replace />}
        />
      </Routes>
    )
  }

  if (authStatus === "superadmin") {
    return (
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/pending-users" replace />} />
          <Route path="pending-users" element={<PendingUsersPage />} />
          <Route path="tenants" element={<TenantsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    )
  }

  // authStatus === "active"
  return (
    <Routes>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
