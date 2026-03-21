import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { WebhookLog } from "./webhook-log"

interface EstadoGestion {
  id: number
  nombre: string
}

interface CrmMapping {
  id: number
  platformSlug: string
  crmStatus: string
  estadoGestion: { id: number; nombre: string }
}

const PLATFORMS = [{ value: "clientify", label: "Clientify" }]

export function CrmStateMapping({ token }: { token: string }) {
  const [estados, setEstados] = useState<EstadoGestion[]>([])
  const [mappings, setMappings] = useState<CrmMapping[]>([])
  const [platform, setPlatform] = useState("clientify")
  const [crmStatus, setCrmStatus] = useState("")
  const [estadoId, setEstadoId] = useState("")
  const [isAdding, setIsAdding] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL

  const fetchData = async () => {
    try {
      const [estadosRes, mappingsRes] = await Promise.all([
        fetch(`${apiUrl}/api/settings/estados-gestion`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/api/settings/crm-mapping`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])
      if (estadosRes.ok) {
        const data = await estadosRes.json()
        setEstados(data.estados || [])
      }
      if (mappingsRes.ok) {
        const data = await mappingsRes.json()
        setMappings(data.mappings || [])
      }
    } catch (err) {
      console.error("Error loading CRM mapping data:", err)
    }
  }

  useEffect(() => {
    if (token) fetchData()
  }, [token])

  const handleAdd = async () => {
    if (!crmStatus.trim() || !estadoId) {
      toast.error("Completa todos los campos")
      return
    }

    setIsAdding(true)
    try {
      const res = await fetch(`${apiUrl}/api/settings/crm-mapping`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          platformSlug: platform,
          crmStatus: crmStatus.trim(),
          catEstadoGestionId: Number(estadoId),
        }),
      })

      if (res.status === 409) {
        toast.error(`El estado "${crmStatus}" ya esta mapeado para ${platform}`)
        return
      }

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || "Error al crear mapeo")
        return
      }

      toast.success("Mapeo creado")
      setCrmStatus("")
      setEstadoId("")
      await fetchData()
    } catch {
      toast.error("Error de conexion")
    } finally {
      setIsAdding(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${apiUrl}/api/settings/crm-mapping/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        toast.success("Mapeo eliminado")
        await fetchData()
      }
    } catch {
      toast.error("Error al eliminar")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Mapeo de Estados CRM</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add form */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1.5 sm:w-40">
            <label className="text-xs text-muted-foreground">Plataforma</label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 flex-1">
            <label className="text-xs text-muted-foreground">Estado en CRM</label>
            <Input
              placeholder="Ej: Contactado"
              value={crmStatus}
              onChange={(e) => setCrmStatus(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:w-48">
            <label className="text-xs text-muted-foreground">Estado en App</label>
            <Select value={estadoId} onValueChange={setEstadoId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent>
                {estados.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleAdd} disabled={isAdding} className="sm:w-auto">
            {isAdding ? "Agregando..." : "Agregar"}
          </Button>
        </div>

        {/* Mappings table */}
        {mappings.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plataforma</TableHead>
                <TableHead>Estado CRM</TableHead>
                <TableHead>Estado App</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="capitalize">{m.platformSlug}</TableCell>
                  <TableCell>{m.crmStatus}</TableCell>
                  <TableCell>{m.estadoGestion.nombre}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(m.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-alert"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No hay mapeos configurados. Agrega uno para empezar.
          </p>
        )}

        {/* Webhook Log */}
        <div className="border-t pt-4">
          <WebhookLog token={token} />
        </div>
      </CardContent>
    </Card>
  )
}
