import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Lock,
  Unlock,
  MessageSquare,
  Mic,
  Phone,
  Database,
  Plug,
  Eye,
  EyeOff,
  ShieldCheck,
  KeyRound,
  Settings,
  Save,
  Check,
  Loader2,
  Copy,
  Link2,
} from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"

const API_URL = import.meta.env.VITE_API_URL || ""

const ICON_MAP: Record<string, React.ReactNode> = {
  MessageSquare: <MessageSquare className="h-4 w-4" />,
  Mic: <Mic className="h-4 w-4" />,
  Phone: <Phone className="h-4 w-4" />,
  Database: <Database className="h-4 w-4" />,
  Plug: <Plug className="h-4 w-4" />,
}

interface IntegrationField {
  id: string
  label: string
  fieldKey: string
  fieldType: string
  required: boolean
}

interface Integration {
  id: string
  name: string
  slug: string
  icon: string | null
  category: string
  fields: IntegrationField[]
  isConnected: boolean
  isActive: boolean
}

export function SecurityVault() {
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)

  const [isLocked, setIsLocked] = useState(true)
  const [hasPin, setHasPin] = useState<boolean | null>(null)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>({})

  // PIN setup/change dialogs
  const [setupPinOpen, setSetupPinOpen] = useState(false)
  const [changePinOpen, setChangePinOpen] = useState(false)
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [currentPinForChange, setCurrentPinForChange] = useState("")
  const [pinError, setPinError] = useState("")
  const [pinSaving, setPinSaving] = useState(false)

  const isAdmin = user?.role === "owner" || user?.role === "admin" || user?.role === "superadmin"

  // Save status per platform
  const [savingPlatform, setSavingPlatform] = useState<Record<string, boolean>>({})
  const [savedPlatform, setSavedPlatform] = useState<Record<string, boolean>>({})
  const [saveError, setSaveError] = useState<Record<string, string>>({})

  // Check vault status
  const checkVaultStatus = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/vault/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setHasPin(data.hasPin)
      }
    } catch {
      // silently fail
    }
  }, [token])

  useEffect(() => {
    checkVaultStatus()
  }, [checkVaultStatus])

  // Fetch integrations after unlock
  const fetchIntegrations = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/vault/integrations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const integs = (data.integrations ?? []) as Integration[]
        setIntegrations(integs)

        // Cargar valores masked de plataformas conectadas
        const newCreds: Record<string, Record<string, string>> = {}
        for (const mod of integs) {
          if (mod.isConnected) {
            try {
              const credRes = await fetch(`${API_URL}/api/vault/integrations/${mod.slug}`, {
                headers: { Authorization: `Bearer ${token}` },
              })
              if (credRes.ok) {
                const credData = await credRes.json()
                if (credData.maskedCredentials) {
                  newCreds[mod.id] = credData.maskedCredentials
                }
              }
            } catch {
              // silently fail per platform
            }
          }
        }
        setCredentials((prev) => ({ ...prev, ...newCreds }))
      }
    } catch {
      // silently fail
    }
  }, [token])

  const handleUnlock = async () => {
    if (!token || !password) return
    setError("")
    try {
      const res = await fetch(`${API_URL}/api/vault/unlock`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pin: password }),
      })
      if (res.ok) {
        setIsLocked(false)
        setPassword("")
        await fetchIntegrations()
      } else {
        setError("PIN incorrecto")
        setTimeout(() => setError(""), 2000)
      }
    } catch {
      setError("Error de conexion")
      setTimeout(() => setError(""), 2000)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleUnlock()
  }

  const toggleFieldVisibility = (moduleId: string) => {
    setShowPasswords((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }))
  }

  const updateCredential = (moduleId: string, field: string, value: string) => {
    setCredentials((prev) => ({
      ...prev,
      [moduleId]: { ...prev[moduleId], [field]: value },
    }))
  }

  // ---- Save credentials per platform ----
  const handleSaveCredentials = async (mod: Integration) => {
    if (!token) return
    setSavingPlatform((prev) => ({ ...prev, [mod.id]: true }))
    setSaveError((prev) => ({ ...prev, [mod.id]: "" }))
    setSavedPlatform((prev) => ({ ...prev, [mod.id]: false }))
    try {
      const res = await fetch(`${API_URL}/api/vault/integrations/${mod.slug}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ credentials: credentials[mod.id] || {} }),
      })
      if (res.ok) {
        setSavedPlatform((prev) => ({ ...prev, [mod.id]: true }))
        setTimeout(() => setSavedPlatform((prev) => ({ ...prev, [mod.id]: false })), 2000)
        await fetchIntegrations()
      } else {
        const data = await res.json()
        setSaveError((prev) => ({ ...prev, [mod.id]: data.error || "Error al guardar" }))
        setTimeout(() => setSaveError((prev) => ({ ...prev, [mod.id]: "" })), 3000)
      }
    } catch {
      setSaveError((prev) => ({ ...prev, [mod.id]: "Error de conexion" }))
      setTimeout(() => setSaveError((prev) => ({ ...prev, [mod.id]: "" })), 3000)
    } finally {
      setSavingPlatform((prev) => ({ ...prev, [mod.id]: false }))
    }
  }

  // ---- PIN Setup ----
  const handleSetupPin = async () => {
    setPinError("")
    if (newPin.length < 4 || newPin.length > 8) {
      setPinError("El PIN debe tener entre 4 y 8 caracteres")
      return
    }
    if (newPin !== confirmPin) {
      setPinError("Los PINs no coinciden")
      return
    }
    setPinSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/vault/setup-pin`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ pin: newPin }),
      })
      if (res.ok) {
        setSetupPinOpen(false)
        setNewPin("")
        setConfirmPin("")
        setHasPin(true)
      } else {
        const data = await res.json()
        setPinError(data.error || "Error al crear PIN")
      }
    } catch {
      setPinError("Error de conexion")
    } finally {
      setPinSaving(false)
    }
  }

  // ---- PIN Change ----
  const handleChangePin = async () => {
    setPinError("")
    if (newPin.length < 4 || newPin.length > 8) {
      setPinError("El nuevo PIN debe tener entre 4 y 8 caracteres")
      return
    }
    if (newPin !== confirmPin) {
      setPinError("Los PINs no coinciden")
      return
    }
    setPinSaving(true)
    try {
      const res = await fetch(`${API_URL}/api/vault/change-pin`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin: currentPinForChange, newPin }),
      })
      if (res.ok) {
        setChangePinOpen(false)
        setNewPin("")
        setConfirmPin("")
        setCurrentPinForChange("")
      } else {
        const data = await res.json()
        setPinError(data.error || "Error al cambiar PIN")
      }
    } catch {
      setPinError("Error de conexion")
    } finally {
      setPinSaving(false)
    }
  }

  // Still loading vault status
  if (hasPin === null) {
    return (
      <Card className="border-aura/20 bg-card">
        <CardContent className="flex items-center justify-center py-10">
          <div className="border-aura/30 border-t-aura h-6 w-6 animate-spin rounded-full border-2" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="border-aura/20 bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground flex items-center gap-2 text-base">
              <div className="bg-aura/10 flex h-6 w-6 items-center justify-center rounded-md">
                {isLocked ? (
                  <Lock className="text-aura h-3.5 w-3.5" />
                ) : (
                  <Unlock className="text-rescue h-3.5 w-3.5" />
                )}
              </div>
              Conectividad de Ecosistema
            </CardTitle>
            <div className="flex items-center gap-2">
              {!isLocked && isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground h-7 gap-1 px-2 text-[11px]"
                  onClick={() => {
                    setPinError("")
                    setNewPin("")
                    setConfirmPin("")
                    setCurrentPinForChange("")
                    setChangePinOpen(true)
                  }}
                >
                  <Settings className="h-3 w-3" />
                  Cambiar PIN
                </Button>
              )}
              {!isLocked && (
                <Badge
                  variant="outline"
                  className="border-rescue/30 text-rescue text-xs"
                >
                  <ShieldCheck className="mr-1 h-3 w-3" />
                  Acceso Verificado
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            {!hasPin ? (
              <motion.div
                key="no-pin"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 py-6"
              >
                <div className="bg-amber-500/5 border-amber-500/10 flex h-16 w-16 items-center justify-center rounded-full border">
                  <KeyRound className="h-7 w-7 text-amber-400" />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-foreground text-sm font-medium">
                    Boveda sin configurar
                  </span>
                  <span className="text-muted-foreground text-center text-xs">
                    {isAdmin
                      ? "Configura un PIN de acceso para proteger las credenciales del ecosistema."
                      : "Un administrador debe configurar el PIN de la boveda."}
                  </span>
                </div>
                {isAdmin && (
                  <Button
                    size="sm"
                    className="bg-aura hover:bg-aura/90 text-foreground gap-1.5"
                    onClick={() => {
                      setPinError("")
                      setNewPin("")
                      setConfirmPin("")
                      setSetupPinOpen(true)
                    }}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Configurar PIN
                  </Button>
                )}
              </motion.div>
            ) : isLocked ? (
              <motion.div
                key="locked"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center gap-4 py-6"
              >
                <div className="bg-aura/5 border-aura/10 flex h-16 w-16 items-center justify-center rounded-full border">
                  <Lock className="text-aura h-7 w-7" />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-foreground text-sm font-medium">
                    Boveda Protegida
                  </span>
                  <span className="text-muted-foreground text-center text-xs">
                    Ingrese el PIN de acceso para ver las credenciales del ecosistema.
                  </span>
                </div>
                <div className="flex w-full max-w-xs items-center gap-2">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="PIN de acceso"
                    className={`border-border/50 bg-secondary/50 text-foreground text-sm ${error ? "border-alert ring-alert/20 ring-2" : "focus-visible:border-aura focus-visible:ring-aura/30"}`}
                  />
                  <Button
                    onClick={handleUnlock}
                    size="sm"
                    className="bg-aura hover:bg-aura/90 text-foreground shrink-0"
                  >
                    Acceder
                  </Button>
                </div>
                <AnimatePresence>
                  {error && (
                    <motion.span
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-alert text-xs"
                    >
                      {error}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div
                key="unlocked"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col gap-5"
              >
                {integrations.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <Plug className="text-muted-foreground h-6 w-6" />
                    <span className="text-muted-foreground text-xs">
                      No hay plataformas de integracion configuradas.
                    </span>
                  </div>
                ) : (
                  integrations.map((mod, mi) => (
                    <motion.div
                      key={mod.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: mi * 0.08 }}
                      className="bg-secondary/30 border-border/30 flex flex-col gap-3 rounded-lg border p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-aura">
                            {ICON_MAP[mod.icon || "Plug"] || ICON_MAP.Plug}
                          </span>
                          <span className="text-foreground text-sm font-medium">
                            {mod.name}
                          </span>
                          {mod.isConnected && (
                            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-[10px]">
                              Conectado
                            </Badge>
                          )}
                        </div>
                        <button
                          onClick={() => toggleFieldVisibility(mod.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={
                            showPasswords[mod.id]
                              ? "Ocultar credenciales"
                              : "Mostrar credenciales"
                          }
                        >
                          {showPasswords[mod.id] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {mod.fields.map((field) => (
                          <div key={field.id} className="flex flex-col gap-1">
                            <Label className="text-muted-foreground text-[11px]">
                              {field.label}
                              {field.required && <span className="ml-1 text-amber-400">*</span>}
                            </Label>
                            <Input
                              type={
                                field.fieldType === "secret" && !showPasswords[mod.id]
                                  ? "password"
                                  : "text"
                              }
                              value={credentials[mod.id]?.[field.fieldKey] ?? ""}
                              onChange={(e) =>
                                updateCredential(mod.id, field.fieldKey, e.target.value)
                              }
                              placeholder="••••••••"
                              className="border-border/30 bg-background/50 text-foreground h-8 font-mono text-xs focus-visible:border-aura focus-visible:ring-aura/30"
                            />
                          </div>
                        ))}
                      </div>

                      {/* Webhook info para Vapi */}
                      {mod.slug === "vapi" && user?.tenantId && (
                        <div className="bg-background/50 border-border/30 rounded-md border p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <Link2 className="text-aura h-3 w-3" />
                            <span className="text-foreground text-[11px] font-medium">Server URL para Vapi</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              readOnly
                              value={`https://rolia-api-377846873300.southamerica-east1.run.app/webhook/vapi/${user.tenantId}`}
                              className="border-border/30 bg-background/50 text-foreground h-7 font-mono text-[10px]"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="shrink-0 h-7 w-7"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  `https://rolia-api-377846873300.southamerica-east1.run.app/webhook/vapi/${user.tenantId}`
                                )
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-muted-foreground text-[10px]">
                            Configura este Server URL en tu asistente de Vapi. Agrega un HTTP header{" "}
                            <code className="text-foreground bg-secondary px-1 rounded">vapi-rolia-key</code> con el mismo
                            valor del campo secret_server_url de arriba.
                          </p>
                        </div>
                      )}

                      {/* Save button + feedback */}
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-2 pt-1">
                          {saveError[mod.id] && (
                            <span className="text-alert text-[11px]">{saveError[mod.id]}</span>
                          )}
                          {savedPlatform[mod.id] && (
                            <span className="flex items-center gap-1 text-emerald-400 text-[11px]">
                              <Check className="h-3 w-3" />
                              Guardado
                            </span>
                          )}
                          <Button
                            size="sm"
                            className="bg-aura hover:bg-aura/90 text-foreground h-7 gap-1.5 px-3 text-[11px]"
                            onClick={() => handleSaveCredentials(mod)}
                            disabled={savingPlatform[mod.id]}
                          >
                            {savingPlatform[mod.id] ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                            {savingPlatform[mod.id] ? "Guardando..." : "Guardar"}
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  ))
                )}

                <p className="text-muted-foreground border-border/30 border-t pt-3 text-center text-[10px] italic">
                  Las credenciales se almacenan encriptadas con AES-256 en el servidor.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Setup PIN Dialog */}
      <Dialog open={setupPinOpen} onOpenChange={setSetupPinOpen}>
        <DialogContent className="bg-background border-border/40 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <KeyRound className="text-aura h-4 w-4" />
              Configurar PIN de Boveda
            </DialogTitle>
            <DialogDescription>
              Este PIN protege las credenciales de integracion de tu empresa. Compartelo solo con usuarios autorizados.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground text-xs">Nuevo PIN (4-8 caracteres)</Label>
              <Input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="••••"
                maxLength={8}
                className="border-border/40 bg-secondary/30 h-9 text-center font-mono text-lg tracking-widest"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground text-xs">Confirmar PIN</Label>
              <Input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="••••"
                maxLength={8}
                className="border-border/40 bg-secondary/30 h-9 text-center font-mono text-lg tracking-widest"
              />
            </div>
            {pinError && (
              <p className="text-alert text-center text-xs">{pinError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSetupPinOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-aura hover:bg-aura/90 text-foreground"
              onClick={handleSetupPin}
              disabled={pinSaving || !newPin || !confirmPin}
            >
              {pinSaving ? "Guardando..." : "Crear PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change PIN Dialog */}
      <Dialog open={changePinOpen} onOpenChange={setChangePinOpen}>
        <DialogContent className="bg-background border-border/40 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Settings className="text-aura h-4 w-4" />
              Cambiar PIN de Boveda
            </DialogTitle>
            <DialogDescription>
              Ingresa tu PIN actual y define uno nuevo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground text-xs">PIN actual</Label>
              <Input
                type="password"
                value={currentPinForChange}
                onChange={(e) => setCurrentPinForChange(e.target.value)}
                placeholder="••••"
                maxLength={8}
                className="border-border/40 bg-secondary/30 h-9 text-center font-mono text-lg tracking-widest"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground text-xs">Nuevo PIN (4-8 caracteres)</Label>
              <Input
                type="password"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="••••"
                maxLength={8}
                className="border-border/40 bg-secondary/30 h-9 text-center font-mono text-lg tracking-widest"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground text-xs">Confirmar nuevo PIN</Label>
              <Input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="••••"
                maxLength={8}
                className="border-border/40 bg-secondary/30 h-9 text-center font-mono text-lg tracking-widest"
              />
            </div>
            {pinError && (
              <p className="text-alert text-center text-xs">{pinError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setChangePinOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-aura hover:bg-aura/90 text-foreground"
              onClick={handleChangePin}
              disabled={pinSaving || !currentPinForChange || !newPin || !confirmPin}
            >
              {pinSaving ? "Guardando..." : "Cambiar PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
