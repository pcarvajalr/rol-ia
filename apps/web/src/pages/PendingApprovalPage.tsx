import { useEffect } from "react"
import { motion } from "framer-motion"
import { ShieldCheck } from "lucide-react"
import { useNavigate } from "react-router"
import { RolLogo } from "@/components/rol-logo"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/auth-store"

export function PendingApprovalPage() {
  const logout = useAuthStore((s) => s.logout)
  const checkStatus = useAuthStore((s) => s.checkStatus)
  const authStatus = useAuthStore((s) => s.authStatus)
  const navigate = useNavigate()

  // Auto-poll every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      checkStatus()
    }, 10000)
    return () => clearInterval(interval)
  }, [checkStatus])

  // Navigate when approved
  useEffect(() => {
    if (authStatus === "active" || authStatus === "superadmin") {
      navigate("/dashboard", { replace: true })
    }
  }, [authStatus, navigate])

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      {/* Background subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(168,85,247,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.3) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="border-border/50 bg-card relative w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl"
      >
        {/* Top accent line */}
        <div className="bg-aura h-1 w-full" />

        <div className="flex flex-col items-center gap-6 p-8">
          {/* Logo */}
          <motion.div
            className="bg-aura/5 border-aura/10 flex items-center justify-center rounded-2xl border px-8 py-5"
            animate={{
              boxShadow: [
                "0 0 0 0 rgba(168,85,247,0)",
                "0 0 40px 8px rgba(168,85,247,0.12)",
                "0 0 0 0 rgba(168,85,247,0)",
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <RolLogo size="lg" showTagline showIcon={true} animate={false} />
          </motion.div>

          {/* Shield icon */}
          <motion.div
            className="bg-aura/10 flex h-20 w-20 items-center justify-center rounded-full"
            animate={{
              scale: [1, 1.08, 1],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <ShieldCheck className="text-aura h-10 w-10" />
          </motion.div>

          {/* Text */}
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-foreground text-lg font-semibold">
              Cuenta pendiente de aprobacion
            </h2>
            <p className="text-muted-foreground text-sm">
              Un administrador revisara tu solicitud. Te notificaremos cuando tu
              cuenta sea aprobada.
            </p>
          </div>

          {/* Polling indicator */}
          <div className="flex items-center gap-2">
            <motion.div
              className="bg-aura h-2 w-2 rounded-full"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <span className="text-muted-foreground text-xs">
              Verificando estado automaticamente...
            </span>
          </div>

          {/* Actions */}
          <div className="flex w-full flex-col gap-3">
            <Button
              variant="ghost"
              onClick={logout}
              className="text-muted-foreground h-11 w-full text-sm"
            >
              Cerrar sesion
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
