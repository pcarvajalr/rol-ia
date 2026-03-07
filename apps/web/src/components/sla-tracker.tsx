
import { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Play,
  UserCheck,
  MessageCircle,
  Timer,
  PhoneCall,
  CheckCircle2,
  Eye,
  Shield,
  Loader2,
  Send,
  User,
  Phone,
  AlertCircle,
} from "lucide-react"

interface SLATrackerProps {
  demoMode: boolean
  slaMinutes: number
  doubleTouchMinutes: number
}

type Phase = "idle" | "human_window" | "ia_intervening" | "completed"

interface ActionStep {
  icon: React.ReactNode
  label: string
  triggerAt: number
}

export function SLATracker({
  demoMode,
  slaMinutes,
  doubleTouchMinutes,
}: SLATrackerProps) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [elapsed, setElapsed] = useState(0)
  const [activeStep, setActiveStep] = useState(-1)
  const [guardianActive, setGuardianActive] = useState(true)
  const [showLeadForm, setShowLeadForm] = useState(false)
  const [leadName, setLeadName] = useState("")
  const [leadPhone, setLeadPhone] = useState("+57")
  const [sendingLead, setSendingLead] = useState(false)
  const [sendError, setSendError] = useState("")
  const [sendSuccess, setSendSuccess] = useState(false)
  const startTimeRef = useRef<number>(0)
  const animFrameRef = useRef<number>(0)

  const slaTriggerMs = slaMinutes * 60 * 1000
  const doubleTouchMs = doubleTouchMinutes * 60 * 1000

  const TOTAL_DURATION_MS = slaTriggerMs + doubleTouchMs + 30000
  const speedFactor = demoMode ? TOTAL_DURATION_MS / 15000 : 1

  const actions: ActionStep[] = [
    {
      icon: <UserCheck className="h-4 w-4" />,
      label: "CRM Check",
      triggerAt: slaTriggerMs + 2000,
    },
    {
      icon: <MessageCircle className="h-4 w-4" />,
      label: "Mensaje Enviado",
      triggerAt: slaTriggerMs + 5000,
    },
    {
      icon: <Timer className="h-4 w-4" />,
      label: `Espera ${doubleTouchMinutes}min`,
      triggerAt: slaTriggerMs + doubleTouchMs + 5000,
    },
    {
      icon: <PhoneCall className="h-4 w-4" />,
      label: "Llamada de Voz",
      triggerAt: slaTriggerMs + doubleTouchMs + 10000,
    },
    {
      icon: <CheckCircle2 className="h-4 w-4" />,
      label: "Cita Agendada",
      triggerAt: slaTriggerMs + doubleTouchMs + 30000,
    },
  ]

  const totalDuration = TOTAL_DURATION_MS

  const tick = useCallback(() => {
    const now = performance.now()
    const realElapsed = now - startTimeRef.current
    const simElapsed = realElapsed * speedFactor

    setElapsed(simElapsed)

    if (simElapsed < slaTriggerMs) {
      setPhase("human_window")
    } else if (simElapsed < totalDuration) {
      setPhase("ia_intervening")
    }

    let step = -1
    for (let i = actions.length - 1; i >= 0; i--) {
      if (simElapsed >= actions[i].triggerAt) {
        step = i
        break
      }
    }
    setActiveStep(step)

    if (simElapsed >= totalDuration) {
      setPhase("completed")
      setActiveStep(actions.length - 1)
      return
    }

    animFrameRef.current = requestAnimationFrame(tick)
  }, [speedFactor, totalDuration, slaTriggerMs, actions])

  const startSimulation = useCallback(() => {
    setPhase("human_window")
    setElapsed(0)
    setActiveStep(-1)
    startTimeRef.current = performance.now()
    animFrameRef.current = requestAnimationFrame(tick)
  }, [tick])

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  const handleOpenLeadForm = () => {
    setSendError("")
    setSendSuccess(false)
    setLeadName("")
    setLeadPhone("+57")
    setShowLeadForm(true)
  }

  const handleSendLead = async (e: React.FormEvent) => {
    e.preventDefault()
    setSendError("")
    setSendingLead(true)

    const trimmedName = leadName.trim()
    const trimmedPhone = leadPhone.trim()

    if (!trimmedName || !trimmedPhone) {
      setSendError("Todos los campos son obligatorios.")
      setSendingLead(false)
      return
    }

    const params = new URLSearchParams({
      waitTime: "1",
      leadId: trimmedName,
      status: "pending",
      phone: trimmedPhone,
    })

    try {
      const res = await fetch(
        `https://orlmuller.app.n8n.cloud/webhook-test/trigger-lead?${params.toString()}`,
        { method: "GET" }
      )

      if (!res.ok) {
        throw new Error(`Error ${res.status}`)
      }

      setSendSuccess(true)
      setTimeout(() => {
        setShowLeadForm(false)
        setSendSuccess(false)
        startSimulation()
      }, 1200)
    } catch (err) {
      setSendError(
        err instanceof Error
          ? `Fallo al enviar: ${err.message}`
          : "Error de conexion con el servidor."
      )
    } finally {
      setSendingLead(false)
    }
  }

  const progressPercent = Math.min((elapsed / totalDuration) * 100, 100)

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
  }

  const formatMinSec = (ms: number) => {
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60)
    const sec = totalSec % 60
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
  }

  const barColor =
    phase === "idle"
      ? "bg-muted"
      : phase === "human_window"
        ? "bg-muted-foreground/30"
        : phase === "completed"
          ? "bg-rescue"
          : "bg-aura"

  const barLabel =
    phase === "idle"
      ? "En espera"
      : phase === "human_window"
        ? "Ventana de Accion Humana"
        : phase === "completed"
          ? "Rescate Completado"
          : "IA INTERVINIENDO"

  return (
    <Card className="border-aura/20 bg-card">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground flex items-center gap-2 text-base">
            <span className="bg-aura/20 text-aura inline-flex h-6 w-6 items-center justify-center rounded-md text-xs">
              G1
            </span>
            Guardian de Leads (Omnicanal)
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {guardianActive ? (
                <Shield className="text-aura h-3.5 w-3.5" />
              ) : (
                <Eye className="text-muted-foreground h-3.5 w-3.5" />
              )}
              <span
                className={`text-xs font-medium ${guardianActive ? "text-aura" : "text-muted-foreground"}`}
              >
                {guardianActive ? "Guardian Activo" : "Modo Observador"}
              </span>
              <Switch
                checked={guardianActive}
                onCheckedChange={setGuardianActive}
                className="data-[state=checked]:bg-aura"
              />
            </div>
            <Badge
              variant="outline"
              className={
                phase === "idle"
                  ? "border-muted-foreground/30 text-muted-foreground"
                  : phase === "human_window"
                    ? "border-alert/30 text-alert"
                    : phase === "completed"
                      ? "border-rescue/30 text-rescue"
                      : "border-aura/30 text-aura"
              }
            >
              {barLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {!guardianActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-secondary/50 border-border/50 flex items-center gap-2 rounded-lg border px-4 py-3 text-xs"
          >
            <Eye className="text-muted-foreground h-4 w-4 shrink-0" />
            <span className="text-muted-foreground">
              Modo Observador activo. Rol.IA registra datos pero no interviene
              automaticamente.
            </span>
          </motion.div>
        )}

        <div className="flex items-center gap-4">
          <Button
            onClick={handleOpenLeadForm}
            disabled={
              (phase !== "idle" && phase !== "completed") || !guardianActive
            }
            className="bg-aura hover:bg-aura/90 text-foreground shrink-0 disabled:opacity-40"
          >
            <Play className="mr-2 h-4 w-4" />
            Simular Lead Entrante
          </Button>
          {phase !== "idle" && (
            <motion.span
              className="text-muted-foreground font-mono text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {formatTime(elapsed)}
            </motion.span>
          )}
        </div>

        {/* Lead Form Dialog */}
        <Dialog open={showLeadForm} onOpenChange={setShowLeadForm}>
          <DialogContent className="border-border/60 bg-card sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-foreground flex items-center gap-2 text-base">
                <Send className="text-aura h-4 w-4" />
                Simular Lead Entrante
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-sm">
                Ingrese los datos del lead para disparar el flujo automatizado.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSendLead} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="lead-name"
                  className="text-muted-foreground text-xs font-medium uppercase tracking-wider"
                >
                  Nombre
                </Label>
                <div className="relative">
                  <User className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="lead-name"
                    type="text"
                    placeholder="Ej: PRUEBA_AURA_001"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    required
                    className="border-border/60 bg-secondary/50 focus:border-aura/50 focus:ring-aura/20 h-10 pl-10 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label
                  htmlFor="lead-phone"
                  className="text-muted-foreground text-xs font-medium uppercase tracking-wider"
                >
                  Telefono
                </Label>
                <div className="relative">
                  <Phone className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                  <Input
                    id="lead-phone"
                    type="tel"
                    placeholder="+573124177702"
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    required
                    className="border-border/60 bg-secondary/50 focus:border-aura/50 focus:ring-aura/20 h-10 pl-10 text-sm"
                  />
                </div>
              </div>

              <AnimatePresence>
                {sendError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-alert/10 border-alert/20 flex items-center gap-2 rounded-lg border px-3 py-2.5"
                  >
                    <AlertCircle className="text-alert h-4 w-4 shrink-0" />
                    <span className="text-alert text-xs">{sendError}</span>
                  </motion.div>
                )}
                {sendSuccess && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-rescue/10 border-rescue/20 flex items-center gap-2 rounded-lg border px-3 py-2.5"
                  >
                    <CheckCircle2 className="text-rescue h-4 w-4 shrink-0" />
                    <span className="text-rescue text-xs">
                      Lead enviado exitosamente. Iniciando simulacion...
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowLeadForm(false)}
                  className="border-border/60 text-muted-foreground"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={sendingLead || sendSuccess}
                  className="bg-aura hover:bg-aura/90 text-foreground disabled:opacity-60"
                >
                  {sendingLead ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : sendSuccess ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Enviado
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Enviar Lead
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <div className="flex flex-col gap-2">
          <div className="bg-secondary h-3 w-full overflow-hidden rounded-full">
            <motion.div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>00:00</span>
            <span className="text-aura">
              {formatMinSec(slaTriggerMs)} - IA Trigger
            </span>
            <span>{formatMinSec(totalDuration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {actions.map((action, i) => (
            <div key={i} className="flex items-center">
              <motion.div
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors ${
                  i <= activeStep
                    ? i < activeStep
                      ? "bg-rescue/10 text-rescue"
                      : "bg-aura/20 text-aura"
                    : "bg-secondary text-muted-foreground"
                }`}
                animate={
                  i === activeStep ? { scale: [1, 1.05, 1] } : {}
                }
                transition={{
                  duration: 0.5,
                  repeat: i === activeStep ? Infinity : 0,
                }}
              >
                {action.icon}
                <span className="hidden sm:inline">{action.label}</span>
              </motion.div>
              {i < actions.length - 1 && (
                <div
                  className={`mx-1 h-px w-4 ${
                    i < activeStep ? "bg-rescue/50" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence>
          {phase === "completed" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-rescue/10 border-rescue/20 text-rescue flex items-center gap-2 rounded-lg border px-4 py-3 text-sm"
            >
              <CheckCircle2 className="h-4 w-4" />
              Cita agendada exitosamente en Google Calendar
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
