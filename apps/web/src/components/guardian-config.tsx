
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Settings2, User, Phone, CheckCircle2, Loader2, RefreshCw } from "lucide-react"

interface GuardianConfigProps {
  slaMinutes: number
  onSlaChange: (value: number) => void
  criticalState: string
  onCriticalStateChange: (value: string) => void
  doubleTouchMinutes: number
  onDoubleTouchChange: (value: number) => void
  tiempoRespuestaLeadSeg: number
  onTiempoRespuestaChange: (value: number) => void
  tiempoLlamadaSeg: number
  onTiempoLlamadaChange: (value: number) => void
  callRetryDays: number
  onCallRetryDaysChange: (value: number) => void
  callRetryMax: number
  onCallRetryMaxChange: (value: number) => void
  tiempoVerdeMins: number
  onTiempoVerdeChange: (v: number) => void
  tiempoAmarilloMins: number
  onTiempoAmarilloChange: (v: number) => void
  onSave: () => void
  isSaving: boolean
}

export function GuardianConfig({
  slaMinutes,
  onSlaChange,
  criticalState,
  onCriticalStateChange,
  doubleTouchMinutes,
  onDoubleTouchChange,
  tiempoRespuestaLeadSeg,
  onTiempoRespuestaChange,
  tiempoLlamadaSeg,
  onTiempoLlamadaChange,
  callRetryDays,
  onCallRetryDaysChange,
  callRetryMax,
  onCallRetryMaxChange,
  tiempoVerdeMins,
  onTiempoVerdeChange,
  tiempoAmarilloMins,
  onTiempoAmarilloChange,
  onSave,
  isSaving,
}: GuardianConfigProps) {
  return (
    <Card className="border-aura/20 bg-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-foreground flex items-center gap-2 text-base">
          <div className="bg-aura/10 flex h-6 w-6 items-center justify-center rounded-md">
            <Settings2 className="text-aura h-3.5 w-3.5" />
          </div>
          Ajustes de Estrategia - Guardian de Leads
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Tiempo de espera WhatsApp */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-foreground text-sm font-medium">
              Tiempo de espera WhatsApp
            </Label>
            <Badge
              variant="outline"
              className="border-aura/30 text-aura font-mono text-xs"
            >
              {Math.round(tiempoRespuestaLeadSeg / 60)} min
            </Badge>
          </div>
          <Slider
            value={[tiempoRespuestaLeadSeg]}
            onValueChange={(v) => onTiempoRespuestaChange(v[0])}
            min={60}
            max={1800}
            step={60}
            className="[&_[data-slot=slider-range]]:bg-aura [&_[data-slot=slider-thumb]]:border-aura"
          />
          <p className="text-muted-foreground text-xs">
            Tiempo antes de que Rol.IA envie WhatsApp automatico si el asesor no responde.
          </p>
        </div>

        {/* Tiempo de espera Llamada */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-foreground text-sm font-medium">
              Tiempo de espera Llamada
            </Label>
            <Badge
              variant="outline"
              className="border-aura/30 text-aura font-mono text-xs"
            >
              {Math.round(tiempoLlamadaSeg / 60)} min
            </Badge>
          </div>
          <Slider
            value={[tiempoLlamadaSeg]}
            onValueChange={(v) => onTiempoLlamadaChange(v[0])}
            min={60}
            max={1800}
            step={60}
            className="[&_[data-slot=slider-range]]:bg-aura [&_[data-slot=slider-thumb]]:border-aura"
          />
          <p className="text-muted-foreground text-xs">
            Tiempo de espera antes de realizar llamada automatica si el lead no responde al WhatsApp.
          </p>
        </div>

        {/* --- CAMPO DISPONIBLE PARA USO FUTURO ---
         * slaMinutes: Tiempo SLA de respuesta humana (1-30 min).
         * Puede usarse para: escalamiento automatico, notificaciones al supervisor,
         * metricas de cumplimiento SLA por asesor.
         * El valor se persiste en tenant.settings.guardian.slaMinutes
         */}
        {/*
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-foreground text-sm font-medium">
              SLA de Respuesta Humana
            </Label>
            <Badge
              variant="outline"
              className="border-aura/30 text-aura font-mono text-xs"
            >
              {slaMinutes} min
            </Badge>
          </div>
          <Slider
            value={[slaMinutes]}
            onValueChange={(v) => onSlaChange(v[0])}
            min={1}
            max={30}
            step={1}
            className="[&_[data-slot=slider-range]]:bg-aura [&_[data-slot=slider-thumb]]:border-aura"
          />
          <p className="text-muted-foreground text-xs">
            Tiempo que Rol.IA espera antes de intervenir automaticamente.
          </p>
        </div>
        */}

        {/* Estado CRM que indica "no atendido" — Gate pre-WhatsApp */}
        <div className="flex flex-col gap-2">
          <Label className="text-foreground text-sm font-medium">
            Estado CRM No Atendido
          </Label>
          <Input
            value={criticalState}
            onChange={(e) => onCriticalStateChange(e.target.value)}
            placeholder="Ej: new, cold-lead, sin-gestionar"
            className="border-border/50 bg-secondary/50 text-foreground font-mono text-sm focus-visible:border-aura focus-visible:ring-aura/30"
          />
          <p className="text-muted-foreground text-xs">
            Estado del CRM que significa que el lead NO ha sido atendido.
            Antes de enviar el WhatsApp automatico, G1 consulta el CRM:
            si el estado cambio a uno diferente a este valor, significa que
            un asesor ya lo atendio y el flujo se detiene automaticamente.
          </p>
        </div>

        {/* Reintentos de Llamada */}
        <div className="border-border/50 rounded-lg border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="text-aura h-3.5 w-3.5" />
            <h3 className="text-sm font-semibold text-foreground">Reintentos de Llamada</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Repetir cada</Label>
              <Badge variant="outline" className="border-aura/30 text-aura font-mono text-xs">
                {callRetryDays} {callRetryDays === 1 ? "dia" : "dias"}
              </Badge>
            </div>
            <Slider
              value={[callRetryDays]}
              onValueChange={([v]) => onCallRetryDaysChange(v)}
              min={1}
              max={7}
              step={1}
              className="[&_[data-slot=slider-range]]:bg-aura [&_[data-slot=slider-thumb]]:border-aura"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Maximo de intentos</Label>
              <Badge variant="outline" className="border-aura/30 text-aura font-mono text-xs">
                {callRetryMax} {callRetryMax === 1 ? "vez" : "veces"}
              </Badge>
            </div>
            <Slider
              value={[callRetryMax]}
              onValueChange={([v]) => onCallRetryMaxChange(v)}
              min={1}
              max={5}
              step={1}
              className="[&_[data-slot=slider-range]]:bg-aura [&_[data-slot=slider-thumb]]:border-aura"
            />
          </div>

          <p className="text-muted-foreground text-xs">
            Si el lead no contesta, se reintentara la llamada cada {callRetryDays} {callRetryDays === 1 ? "dia" : "dias"} hasta un maximo de {callRetryMax} {callRetryMax === 1 ? "vez" : "veces"}.
          </p>
        </div>

        {/* --- CAMPO DISPONIBLE PARA USO FUTURO ---
         * doubleTouchMinutes: Ventana entre mensaje de texto y llamada de voz (1-10 min).
         * Puede usarse para: separar el timing del WhatsApp y la llamada VAPI
         * en vez de usar el mismo tiempoRespuestaLeadSeg para ambos timers.
         * El valor se persiste en tenant.settings.guardian.doubleTouchMinutes
         */}
        {/*
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-foreground text-sm font-medium">
              Ventana de Doble Toque
            </Label>
            <Badge
              variant="outline"
              className="border-aura/30 text-aura font-mono text-xs"
            >
              {doubleTouchMinutes} min
            </Badge>
          </div>
          <Slider
            value={[doubleTouchMinutes]}
            onValueChange={(v) => onDoubleTouchChange(v[0])}
            min={1}
            max={10}
            step={1}
            className="[&_[data-slot=slider-range]]:bg-aura [&_[data-slot=slider-thumb]]:border-aura"
          />
          <p className="text-muted-foreground text-xs">
            Minutos de espera entre el mensaje de texto automatico y la llamada
            de voz.
          </p>
        </div>
        */}

        {/* Semaforo de Abandono */}
        <div className="border-border/50 rounded-lg border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="bg-rescue h-2.5 w-2.5 rounded-full" />
              <span className="bg-warning h-2.5 w-2.5 rounded-full" />
              <span className="bg-alert h-2.5 w-2.5 rounded-full" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Semaforo de Abandono</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="bg-rescue h-2 w-2 rounded-full" />
                <Label className="text-sm">Verde (OK)</Label>
              </div>
              <Badge variant="outline" className="border-rescue/30 text-rescue font-mono text-xs">
                {tiempoVerdeMins} min
              </Badge>
            </div>
            <Slider
              value={[tiempoVerdeMins]}
              onValueChange={([v]) => onTiempoVerdeChange(v)}
              min={1}
              max={30}
              step={1}
              className="[&_[data-slot=slider-range]]:bg-rescue [&_[data-slot=slider-thumb]]:border-rescue"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="bg-warning h-2 w-2 rounded-full" />
                <Label className="text-sm">Amarillo (En riesgo)</Label>
              </div>
              <Badge variant="outline" className="border-warning/30 text-warning font-mono text-xs">
                {tiempoAmarilloMins} min ({tiempoVerdeMins + tiempoAmarilloMins} min max)
              </Badge>
            </div>
            <Slider
              value={[tiempoAmarilloMins]}
              onValueChange={([v]) => onTiempoAmarilloChange(v)}
              min={1}
              max={30}
              step={1}
              className="[&_[data-slot=slider-range]]:bg-warning [&_[data-slot=slider-thumb]]:border-warning"
            />
          </div>

          <div className="flex items-center justify-between rounded-md bg-alert/5 border border-alert/20 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="bg-alert h-2 w-2 rounded-full" />
              <span className="text-sm text-muted-foreground">Rojo (Critico)</span>
            </div>
            <Badge variant="outline" className="border-alert/30 text-alert font-mono text-xs">
              &gt; {tiempoVerdeMins + tiempoAmarilloMins} min
            </Badge>
          </div>
        </div>

        {/* Mapeo de Datos */}
        <div className="flex flex-col gap-3">
          <Label className="text-foreground text-sm font-medium">
            Mapeo de Datos del Flujo Entrante
          </Label>
          <div className="flex flex-col gap-2">
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-rescue/5 border-rescue/20 flex items-center gap-3 rounded-lg border px-4 py-2.5"
            >
              <div className="bg-rescue/10 flex h-7 w-7 items-center justify-center rounded-md">
                <User className="text-rescue h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-foreground text-xs font-medium">
                  Nombre
                </span>
                <span className="text-muted-foreground text-[10px]">
                  Capturando del flujo entrante
                </span>
              </div>
              <CheckCircle2 className="text-rescue ml-auto h-4 w-4" />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-rescue/5 border-rescue/20 flex items-center gap-3 rounded-lg border px-4 py-2.5"
            >
              <div className="bg-rescue/10 flex h-7 w-7 items-center justify-center rounded-md">
                <Phone className="text-rescue h-3.5 w-3.5" />
              </div>
              <div className="flex flex-col">
                <span className="text-foreground text-xs font-medium">
                  Telefono
                </span>
                <span className="text-muted-foreground text-[10px]">
                  Capturando del flujo entrante
                </span>
              </div>
              <CheckCircle2 className="text-rescue ml-auto h-4 w-4" />
            </motion.div>
          </div>
        </div>

        {/* Guardar */}
        <Button
          onClick={onSave}
          disabled={isSaving}
          className="bg-aura hover:bg-aura/90 w-full"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            "Guardar Configuracion"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
