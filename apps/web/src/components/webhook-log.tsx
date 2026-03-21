import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronDown, ChevronRight } from "lucide-react"

interface LogEntry {
  id: string
  source: string
  externalId: string | null
  crmStatus: string | null
  action: string
  timestamp: string
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const ACTION_LABELS: Record<string, string> = {
  created: "Creado",
  status_changed: "Cambio de estado",
  ignored: "Ignorado",
  ignored_completed: "Ignorado (completado)",
  deleted: "Eliminado",
  error: "Error",
}

export function WebhookLog({ token }: { token: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
  const [sourceFilter, setSourceFilter] = useState("all")

  const apiUrl = import.meta.env.VITE_API_URL

  const fetchLogs = async (page = 1) => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" })
      if (sourceFilter !== "all") params.set("source", sourceFilter)

      const res = await fetch(`${apiUrl}/api/settings/webhook-log?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
        setPagination(data.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 0 })
      }
    } catch (err) {
      console.error("Error loading webhook logs:", err)
    }
  }

  useEffect(() => {
    if (isOpen && token) fetchLogs(1)
  }, [isOpen, token, sourceFilter])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Historial de Webhooks
        {pagination.total > 0 && (
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{pagination.total}</span>
        )}
      </button>

      {isOpen && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filtrar fuente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="clientify">Clientify</SelectItem>
                <SelectItem value="meta">Meta</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {logs.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha/Hora</TableHead>
                    <TableHead>Fuente</TableHead>
                    <TableHead>Estado CRM</TableHead>
                    <TableHead>Accion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs font-mono">{formatDate(log.timestamp)}</TableCell>
                      <TableCell className="capitalize">{log.source}</TableCell>
                      <TableCell>{log.crmStatus || "—"}</TableCell>
                      <TableCell>{ACTION_LABELS[log.action] || log.action}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Pagina {pagination.page} de {pagination.totalPages} ({pagination.total} registros)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => fetchLogs(pagination.page - 1)}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => fetchLogs(pagination.page + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay registros de webhooks.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
