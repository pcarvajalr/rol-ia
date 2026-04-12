import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  XCircle,
  Zap,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Phone,
  MessageSquare,
  Calendar,
  Filter,
} from "lucide-react"
import { useIntelFetch } from "@/hooks/use-intel-fetch"
import { Skeleton } from "@/components/ui/skeleton"
import { IntelEmptyState } from "./intel-empty-state"

interface RescueEvent {
  leadId: string
  leadName: string
  timestamp: string
  humanFailure: string
  humanDetail: string
  iaAction: string
  iaDetail: string
  result: "rescued" | "lost" | "pending"
  rescueType: "whatsapp" | "call" | "calendar"
}

interface VendorData {
  id: string
  name: string
  avatar: string
  totalLeads: number
  rescuedByIA: number
  lostLeads: number
  avgResponseTime: string
  status: "critical" | "warning" | "ok"
  events: RescueEvent[]
}

interface RescueVendorData {
  vendors: VendorData[]
}

const rescueTypeIcons = {
  whatsapp: <MessageSquare className="h-3.5 w-3.5" />,
  call: <Phone className="h-3.5 w-3.5" />,
  calendar: <Calendar className="h-3.5 w-3.5" />,
}

const resultConfig = {
  rescued: { label: "Rescatado", color: "text-green-500", bg: "bg-green-500/10" },
  lost: { label: "Perdido", color: "text-destructive", bg: "bg-destructive/10" },
  pending: { label: "En Proceso", color: "text-yellow-500", bg: "bg-yellow-500/10" },
}

const statusConfig = {
  critical: { label: "Critico", color: "text-destructive", bg: "bg-destructive" },
  warning: { label: "Alerta", color: "text-yellow-500", bg: "bg-yellow-500" },
  ok: { label: "Optimo", color: "text-green-500", bg: "bg-green-500" },
}

export function ForensicRescueVendor() {
  const { data, loading } = useIntelFetch<RescueVendorData>("/api/intel/forensic-rescue-by-vendor", { vendors: [] })

  const [expandedVendor, setExpandedVendor] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterResult, setFilterResult] = useState<string>("all")

  if (loading) return <Skeleton className="h-[300px] rounded-xl" />
  if (data.vendors.length === 0) return <IntelEmptyState />

  // Auto-expand first vendor on load
  if (expandedVendor === null && data.vendors.length > 0) {
    setExpandedVendor(data.vendors[0].id)
  }

  const filteredVendors = data.vendors.filter((v) => {
    if (filterStatus !== "all" && v.status !== filterStatus) return false
    return true
  })

  const filterEvents = (events: RescueEvent[]) => {
    if (filterResult === "all") return events
    return events.filter((e) => e.result === filterResult)
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">
              Registro de Rescates por Vendedor
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              Que no hizo el vendedor vs que tuvo que hacer ROL.IA
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="text-muted-foreground h-4 w-4" />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="critical">Criticos</SelectItem>
                <SelectItem value="warning">En Alerta</SelectItem>
                <SelectItem value="ok">Optimos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterResult} onValueChange={setFilterResult}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Resultado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="rescued">Rescatados</SelectItem>
                <SelectItem value="lost">Perdidos</SelectItem>
                <SelectItem value="pending">En Proceso</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {filteredVendors.map((vendor) => {
          const isExpanded = expandedVendor === vendor.id
          const filteredEvents = filterEvents(vendor.events)
          const stCfg = statusConfig[vendor.status]

          return (
            <div
              key={vendor.id}
              className="overflow-hidden rounded-xl border"
            >
              {/* Vendor Header */}
              <button
                onClick={() => setExpandedVendor(isExpanded ? null : vendor.id)}
                className="hover:bg-muted/30 flex w-full items-center justify-between px-4 py-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${stCfg.bg}/20 text-sm font-semibold ${stCfg.color}`}>
                    {vendor.avatar}
                  </div>

                  <div className="flex flex-col items-start gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {vendor.name}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${stCfg.color}`}>
                        {stCfg.label}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
                      <span>{vendor.totalLeads} leads</span>
                      <span className="text-border">|</span>
                      <span className="text-green-500">{vendor.rescuedByIA} rescatados IA</span>
                      <span className="text-border">|</span>
                      <span>Resp: {vendor.avgResponseTime}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {vendor.lostLeads > 0 && (
                    <div className="bg-destructive/10 flex items-center gap-1.5 rounded-full px-2.5 py-1">
                      <AlertTriangle className="text-destructive h-3 w-3" />
                      <span className="text-destructive text-[11px] font-medium">
                        {vendor.lostLeads} perdidos
                      </span>
                    </div>
                  )}
                  {isExpanded ? (
                    <ChevronUp className="text-muted-foreground h-4 w-4" />
                  ) : (
                    <ChevronDown className="text-muted-foreground h-4 w-4" />
                  )}
                </div>
              </button>

              {/* Events List */}
              <AnimatePresence>
                {isExpanded && filteredEvents.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t"
                  >
                    <div className="flex flex-col gap-2 p-4">
                      {/* Column Headers */}
                      <div className="text-muted-foreground mb-2 grid grid-cols-[60px_1fr_1fr_80px] gap-4 px-2 text-[10px] font-semibold uppercase tracking-wider">
                        <span>Lead</span>
                        <span className="text-destructive flex items-center gap-1.5">
                          <XCircle className="h-3 w-3" />
                          Falla del Vendedor
                        </span>
                        <span className="flex items-center gap-1.5 text-green-500">
                          <Zap className="h-3 w-3" />
                          Accion ROL.IA
                        </span>
                        <span className="text-right">Resultado</span>
                      </div>

                      {filteredEvents.map((event, i) => {
                        const resCfg = resultConfig[event.result]
                        return (
                          <motion.div
                            key={event.leadId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="bg-muted/30 grid grid-cols-[60px_1fr_1fr_80px] gap-4 rounded-lg px-3 py-3"
                          >
                            {/* Lead Info */}
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono text-xs text-blue-500">
                                #{event.leadId}
                              </span>
                              <span className="text-muted-foreground truncate text-[10px]">
                                {event.timestamp}
                              </span>
                            </div>

                            {/* Human Failure */}
                            <div className="flex flex-col gap-1">
                              <span className="text-destructive text-xs font-medium">
                                {event.humanFailure}
                              </span>
                              <span className="text-muted-foreground text-[11px] leading-relaxed">
                                {event.humanDetail}
                              </span>
                            </div>

                            {/* IA Action */}
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-green-500">
                                  {rescueTypeIcons[event.rescueType]}
                                </span>
                                <span className="text-xs font-medium text-green-500">
                                  {event.iaAction}
                                </span>
                              </div>
                              <span className="text-muted-foreground text-[11px] leading-relaxed">
                                {event.iaDetail}
                              </span>
                            </div>

                            {/* Result */}
                            <div className="flex justify-end">
                              <Badge className={`${resCfg.bg} ${resCfg.color} border-0 text-[10px]`}>
                                {resCfg.label}
                              </Badge>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}

                {isExpanded && filteredEvents.length === 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t p-4"
                  >
                    <p className="text-muted-foreground text-center text-xs">
                      No hay eventos que coincidan con los filtros seleccionados.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}

        {filteredVendors.length === 0 && (
          <p className="text-muted-foreground py-8 text-center text-sm">No hay vendedores que coincidan con el filtro</p>
        )}

        {/* Summary Footer */}
        <div className="text-muted-foreground mt-2 flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-4 text-[11px]">
            <span>
              Total rescatados: <strong className="text-green-500">{data.vendors.reduce((sum, v) => sum + v.rescuedByIA, 0)}</strong>
            </span>
            <span>
              Total perdidos: <strong className="text-destructive">{data.vendors.reduce((sum, v) => sum + v.lostLeads, 0)}</strong>
            </span>
          </div>
          <p className="text-muted-foreground/60 text-[10px]">
            ROL.IA documenta cada intervencion para rendicion de cuentas
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
