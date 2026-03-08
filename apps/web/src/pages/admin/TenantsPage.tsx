import { useState, useEffect, useCallback } from "react"
import { Building2 } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthStore } from "@/stores/auth-store"

interface TenantData {
  id: string
  name: string
  slug: string
  plan: string
  active: boolean
  createdAt: string
  _count: { users: number }
}

const API_URL = import.meta.env.VITE_API_URL || ""

export function TenantsPage() {
  const token = useAuthStore((s) => s.token)
  const [tenants, setTenants] = useState<TenantData[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTenants = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/admin/tenants`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setTenants(data.tenants ?? data)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">Empresas</h2>
        <div className="border-border/40 rounded-xl border">
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (tenants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="bg-aura/10 flex h-16 w-16 items-center justify-center rounded-full">
          <Building2 className="text-aura h-8 w-8" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <h3 className="text-foreground text-sm font-medium">
            No hay empresas registradas
          </h3>
          <p className="text-muted-foreground text-xs">
            Las empresas apareceran aqui cuando los usuarios se registren.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-foreground text-lg font-semibold">Empresas</h2>
        <Badge variant="outline" className="border-border/40 text-muted-foreground">
          {tenants.length} empresa{tenants.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="border-border/40 rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="border-border/40 hover:bg-transparent">
              <TableHead className="text-muted-foreground text-xs">
                Nombre
              </TableHead>
              <TableHead className="text-muted-foreground text-xs">
                Slug
              </TableHead>
              <TableHead className="text-muted-foreground text-xs">
                Plan
              </TableHead>
              <TableHead className="text-muted-foreground text-xs">
                # Usuarios
              </TableHead>
              <TableHead className="text-muted-foreground text-xs">
                Estado
              </TableHead>
              <TableHead className="text-muted-foreground text-xs">
                Fecha creacion
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((tenant) => (
              <TableRow key={tenant.id} className="border-border/40">
                <TableCell className="text-foreground text-sm font-medium">
                  {tenant.name}
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-sm">
                  {tenant.slug}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className="border-aura/30 text-aura text-xs"
                  >
                    {tenant.plan}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {tenant._count.users}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      tenant.active
                        ? "border-emerald-500/30 text-emerald-400 text-xs"
                        : "border-border/40 text-muted-foreground text-xs"
                    }
                  >
                    {tenant.active ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(tenant.createdAt).toLocaleDateString("es-CL")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
