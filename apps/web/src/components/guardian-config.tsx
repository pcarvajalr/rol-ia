
import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Settings2, Loader2, RefreshCw, AlertTriangle, Info } from "lucide-react"

/* ───── Linea de tiempo visual ───── */

function TimelineVisualization({
  tiempoRespuestaLeadSeg,
  tiempoLlamadaSeg,
  tiempoVerdeMins,
  tiempoAmarilloMins,
}: {
  tiempoRespuestaLeadSeg: number
  tiempoLlamadaSeg: number
  tiempoVerdeMins: number
  tiempoAmarilloMins: number
}) {
  const analysis = useMemo(() => {
    const whatsappMins = tiempoRespuestaLeadSeg / 60
    const llamadaMins = (tiempoRespuestaLeadSeg + tiempoLlamadaSeg) / 60
    const verdeMax = tiempoVerdeMins
    const amarilloMax = tiempoVerdeMins + tiempoAmarilloMins

    // Que color tendra el semaforo en cada evento
    const colorAt = (mins: number) => {
      if (mins <= verdeMax) return "verde"
      if (mins <= amarilloMax) return "amarillo"
      return "rojo"
    }

    const whatsappColor = colorAt(whatsappMins)
    const llamadaColor = colorAt(llamadaMins)

    // Helper para formatear hora ejemplo (10:00 + mins)
    const fmtTime = (mins: number) => {
      const h = 10 + Math.floor(mins / 60)
      const m = Math.round(mins % 60)
      return `${h}:${m.toString().padStart(2, "0")}`
    }

    // Warnings
    const warnings: string[] = []
    if (whatsappColor !== "verde") {
      warnings.push(
        `El WhatsApp se envia a los ${whatsappMins} min, pero el semaforo verde termina a los ${verdeMax} min. ` +
        `Ningun lead atendido por automatizacion sera verde. ` +
        `Ej: lead entra a las 10:00 → a las ${fmtTime(verdeMax)} ya es ${whatsappColor}, ` +
        `pero el WhatsApp recien sale a las ${fmtTime(whatsappMins)}.`
      )
    }
    if (llamadaColor === "rojo") {
      warnings.push(
        `La llamada se ejecuta a los ${llamadaMins} min, pero el rojo empieza a los ${amarilloMax} min. ` +
        `Si el lead no responde el WhatsApp, la llamada siempre llega en rojo.`
      )
    }

    // Info / tips
    const tips: string[] = []
    if (warnings.length === 0) {
      tips.push(
        `Configuracion coherente: WhatsApp sale a los ${whatsappMins} min (${whatsappColor}) ` +
        `y llamada a los ${llamadaMins} min (${llamadaColor}).`
      )
    } else if (whatsappColor !== "verde" && llamadaColor !== "rojo") {
      tips.push(
        `Sugerencia: sube el verde a al menos ${Math.ceil(whatsappMins)} min ` +
        `para que leads atendidos por WhatsApp puedan ser verdes.`
      )
    } else if (llamadaColor === "rojo") {
      tips.push(
        `Sugerencia: sube verde + amarillo a al menos ${Math.ceil(llamadaMins)} min en total. ` +
        `Ej: verde = ${Math.ceil(whatsappMins)} min, amarillo = ${Math.ceil(llamadaMins - whatsappMins)} min.`
      )
    }

    // Escala de la barra: el max es el mayor entre amarilloMax y llamadaMins + 20% padding
    const timelineMax = Math.max(amarilloMax, llamadaMins) * 1.2

    return {
      whatsappMins,
      llamadaMins,
      verdeMax,
      amarilloMax,
      timelineMax,
      whatsappColor,
      llamadaColor,
      warnings,
      tips,
    }
  }, [tiempoRespuestaLeadSeg, tiempoLlamadaSeg, tiempoVerdeMins, tiempoAmarilloMins])

  const { whatsappMins, llamadaMins, verdeMax, amarilloMax, timelineMax, whatsappColor, llamadaColor, warnings, tips } = analysis

  const pct = (mins: number) => Math.min((mins / timelineMax) * 100, 100)

  const semaphoreColorClass = (color: string) => {
    if (color === "verde") return "text-rescue"
    if (color === "amarillo") return "text-warning"
    return "text-alert"
  }

  const semaphoreBgClass = (color: string) => {
    if (color === "verde") return "bg-rescue"
    if (color === "amarillo") return "bg-warning"
    return "bg-alert"
  }

  return (
    <div className="border-border/50 rounded-lg border p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Info className="text-aura h-3.5 w-3.5" />
        <h3 className="text-sm font-semibold text-foreground">Linea de Tiempo del Lead</h3>
      </div>

      {/* Barra de timeline */}
      <div className="space-y-2">
        {/* Zonas del semaforo */}
        <div className="relative h-6 rounded-full overflow-hidden bg-muted/30 border border-border/30">
          {/* Verde */}
          <div
            className="absolute inset-y-0 left-0 bg-rescue/25 border-r border-rescue/40"
            style={{ width: `${pct(verdeMax)}%` }}
          />
          {/* Amarillo */}
          <div
            className="absolute inset-y-0 bg-warning/25 border-r border-warning/40"
            style={{ left: `${pct(verdeMax)}%`, width: `${pct(amarilloMax) - pct(verdeMax)}%` }}
          />
          {/* Rojo */}
          <div
            className="absolute inset-y-0 bg-alert/15"
            style={{ left: `${pct(amarilloMax)}%`, right: 0 }}
          />

          {/* Marcador WhatsApp */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-aura z-10"
            style={{ left: `${pct(whatsappMins)}%` }}
          >
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-mono text-aura">
              WA {whatsappMins}m
            </div>
          </div>

          {/* Marcador Llamada */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-foreground/70 z-10"
            style={{ left: `${pct(llamadaMins)}%` }}
          >
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-mono text-muted-foreground">
              Tel {llamadaMins}m
            </div>
          </div>
        </div>

        {/* Leyenda de zonas debajo de la barra */}
        <div className="flex items-center gap-3 pt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="bg-rescue/40 h-2 w-2 rounded-sm" />
            Verde 0-{verdeMax}m
          </span>
          <span className="flex items-center gap-1">
            <span className="bg-warning/40 h-2 w-2 rounded-sm" />
            Amarillo {verdeMax}-{amarilloMax}m
          </span>
          <span className="flex items-center gap-1">
            <span className="bg-alert/30 h-2 w-2 rounded-sm" />
            Rojo &gt;{amarilloMax}m
          </span>
        </div>
      </div>

      {/* Estado de cada evento */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2">
          <span className={`h-2 w-2 rounded-full ${semaphoreBgClass(whatsappColor)}`} />
          <div className="text-xs">
            <span className="text-muted-foreground">WhatsApp:</span>{" "}
            <span className={`font-medium ${semaphoreColorClass(whatsappColor)}`}>
              {whatsappColor}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2">
          <span className={`h-2 w-2 rounded-full ${semaphoreBgClass(llamadaColor)}`} />
          <div className="text-xs">
            <span className="text-muted-foreground">Llamada:</span>{" "}
            <span className={`font-medium ${semaphoreColorClass(llamadaColor)}`}>
              {llamadaColor}
            </span>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {warnings.map((w, i) => (
        <Alert key={i} className="border-warning/30 bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-xs text-warning">
            {w}
          </AlertDescription>
        </Alert>
      ))}

      {/* Tips */}
      {tips.map((t, i) => (
        <Alert key={i} className={warnings.length > 0 ? "border-aura/30 bg-aura/5" : "border-rescue/30 bg-rescue/5"}>
          <Info className={`h-4 w-4 ${warnings.length > 0 ? "text-aura" : "text-rescue"}`} />
          <AlertDescription className={`text-xs ${warnings.length > 0 ? "text-aura" : "text-rescue"}`}>
            {t}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  )
}

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

        {/* Linea de tiempo visual */}
        <TimelineVisualization
          tiempoRespuestaLeadSeg={tiempoRespuestaLeadSeg}
          tiempoLlamadaSeg={tiempoLlamadaSeg}
          tiempoVerdeMins={tiempoVerdeMins}
          tiempoAmarilloMins={tiempoAmarilloMins}
        />

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
