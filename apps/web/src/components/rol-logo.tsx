
import { motion } from "framer-motion"

interface RolLogoProps {
  size?: "xs" | "sm" | "md" | "lg"
  showTagline?: boolean
  showIcon?: boolean
  animate?: boolean
}

export function RolLogo({
  size = "md",
  showTagline = false,
  showIcon = true,
  animate = false,
}: RolLogoProps) {
  const sizes = {
    xs: {
      icon: 20,
      text: "text-sm",
      dot: "text-sm",
      tagline: "text-[8px]",
      gap: "gap-1.5",
    },
    sm: {
      icon: 28,
      text: "text-base",
      dot: "text-base",
      tagline: "text-[9px]",
      gap: "gap-2",
    },
    md: {
      icon: 36,
      text: "text-xl",
      dot: "text-xl",
      tagline: "text-[10px]",
      gap: "gap-2.5",
    },
    lg: {
      icon: 48,
      text: "text-3xl",
      dot: "text-3xl",
      tagline: "text-xs",
      gap: "gap-3",
    },
  }

  const s = sizes[size]

  return (
    <div className="flex flex-col items-start gap-1">
      <div className={`flex items-center ${s.gap}`}>
        {showIcon && <RolIcon size={s.icon} animate={animate} />}

        {/* Text logo */}
        <div className="flex items-baseline">
          <span className={`text-foreground font-semibold tracking-tight ${s.text}`}>
            Rol
          </span>
          <span className={`text-aura font-bold ${s.dot}`}>.</span>
          <span className={`text-aura font-semibold tracking-tight ${s.text}`}>
            IA
          </span>
        </div>
      </div>

      {showTagline && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
          className={`text-muted-foreground leading-tight ${s.tagline}`}
        >
          La IA no piensa por uno, piensa con uno
        </motion.p>
      )}
    </div>
  )
}

/* Rol.IA Icon - Neural hub network symbol */
export function RolIcon({
  size = 32,
  className = "",
  animate = false,
}: {
  size?: number
  className?: string
  animate?: boolean
}) {
  const iconSize = typeof size === "number" ? size : 32

  return (
    <motion.div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: iconSize, height: iconSize }}
      animate={animate ? { scale: [1, 1.02, 1] } : {}}
      transition={animate ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : {}}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-IpJTDXOLbefcmEmvlmWLRxDgvS3akN.png"
        alt="Rol.IA"
        width={iconSize}
        height={iconSize}
        style={{ width: iconSize, height: iconSize }}
        className="object-contain"
      />
    </motion.div>
  )
}
