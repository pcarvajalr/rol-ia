import { useState } from "react"
import { motion } from "framer-motion"
import { Mail, Loader2 } from "lucide-react"
import { RolLogo } from "@/components/rol-logo"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/auth-store"

export function VerifyEmailPage() {
  const verifyEmail = useAuthStore((s) => s.verifyEmail)
  const resendVerification = useAuthStore((s) => s.resendVerification)
  const logout = useAuthStore((s) => s.logout)
  const error = useAuthStore((s) => s.error)

  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  const handleVerify = async () => {
    setVerifying(true)
    try {
      await verifyEmail()
    } finally {
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      await resendVerification()
      setResent(true)
      setTimeout(() => setResent(false), 4000)
    } finally {
      setResending(false)
    }
  }

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

          {/* Mail icon */}
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
            <Mail className="text-aura h-10 w-10" />
          </motion.div>

          {/* Text */}
          <div className="flex flex-col items-center gap-2 text-center">
            <h2 className="text-foreground text-lg font-semibold">
              Revisa tu correo
            </h2>
            <p className="text-muted-foreground text-sm">
              Enviamos un enlace de verificacion a tu email. Haz clic en el
              enlace y luego vuelve aqui.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-alert/10 border-alert/20 w-full rounded-lg border px-3 py-2.5">
              <span className="text-alert text-xs">{error}</span>
            </div>
          )}

          {/* Resent confirmation */}
          {resent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-aura/10 border-aura/20 w-full rounded-lg border px-3 py-2.5 text-center"
            >
              <span className="text-aura text-xs">
                Correo de verificacion reenviado
              </span>
            </motion.div>
          )}

          {/* Actions */}
          <div className="flex w-full flex-col gap-3">
            <Button
              onClick={handleVerify}
              disabled={verifying}
              className="bg-aura hover:bg-aura/90 text-foreground h-11 w-full text-sm font-medium disabled:opacity-60"
            >
              {verifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                "Ya verifique mi correo"
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleResend}
              disabled={resending}
              className="border-border/60 h-11 w-full text-sm"
            >
              {resending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Reenviando...
                </>
              ) : (
                "Reenviar correo"
              )}
            </Button>

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
