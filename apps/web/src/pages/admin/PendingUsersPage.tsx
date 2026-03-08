import { useState, useEffect, useCallback } from "react"
import { Loader2, CheckCircle, XCircle, Users } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useAuthStore } from "@/stores/auth-store"

interface PendingUser {
  id: string
  email: string
  name: string | null
  role: string
  createdAt: string
  tenant: { id: string; name: string; slug: string } | null
}

const API_URL = import.meta.env.VITE_API_URL || ""

export function PendingUsersPage() {
  const token = useAuthStore((s) => s.token)
  const [users, setUsers] = useState<PendingUser[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/admin/pending-users`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users ?? data)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleApprove = async (userId: string) => {
    if (!token) return
    setActionLoading(userId)
    try {
      await fetch(`${API_URL}/admin/users/${userId}/approve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      setUsers((prev) => prev.filter((u) => u.id !== userId))
    } catch {
      // silently fail
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (userId: string) => {
    if (!token) return
    setActionLoading(userId)
    try {
      await fetch(`${API_URL}/admin/users/${userId}/reject`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      setUsers((prev) => prev.filter((u) => u.id !== userId))
    } catch {
      // silently fail
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">
          Solicitudes pendientes
        </h2>
        <div className="border-border/40 rounded-xl border">
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="bg-aura/10 flex h-16 w-16 items-center justify-center rounded-full">
          <Users className="text-aura h-8 w-8" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <h3 className="text-foreground text-sm font-medium">
            No hay solicitudes pendientes
          </h3>
          <p className="text-muted-foreground text-xs">
            Todas las solicitudes han sido procesadas.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-foreground text-lg font-semibold">
          Solicitudes pendientes
        </h2>
        <Badge variant="outline" className="border-aura/30 text-aura">
          {users.length} pendiente{users.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="border-border/40 rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="border-border/40 hover:bg-transparent">
              <TableHead className="text-muted-foreground text-xs">
                Email
              </TableHead>
              <TableHead className="text-muted-foreground text-xs">
                Empresa
              </TableHead>
              <TableHead className="text-muted-foreground text-xs">
                Fecha registro
              </TableHead>
              <TableHead className="text-muted-foreground text-right text-xs">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} className="border-border/40">
                <TableCell className="text-foreground text-sm">
                  {user.email}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {user.tenant?.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(user.createdAt).toLocaleDateString("es-CL")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(user.id)}
                      disabled={actionLoading === user.id}
                      className="bg-emerald-600 hover:bg-emerald-700 h-8 gap-1.5 text-xs text-white"
                    >
                      {actionLoading === user.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5" />
                      )}
                      Aprobar
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={actionLoading === user.id}
                          className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 h-8 gap-1.5 text-xs"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Rechazar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-card border-border/50">
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Rechazar solicitud
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta accion rechazara la solicitud de{" "}
                            <span className="text-foreground font-medium">
                              {user.email}
                            </span>
                            . Esta accion no se puede deshacer.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="border-border/60">
                            Cancelar
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleReject(user.id)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            Rechazar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
