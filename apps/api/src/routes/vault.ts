import { Hono } from "hono"
import { prisma } from "../db/client"
import type { AuthUser } from "../middleware/auth"
import type { TenantUser } from "../middleware/tenant"
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto"

const vaultRouter = new Hono<{
  Variables: {
    authUser: AuthUser
    user: TenantUser
    tenantId: string
  }
}>()

function hashPin(pin: string, salt: string): string {
  return createHash("sha256").update(pin + salt).digest("hex")
}

function createPinHash(pin: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = hashPin(pin, salt)
  return `${salt}:${hash}`
}

function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return false
  return hashPin(pin, salt) === hash
}

// GET /api/vault/status - Check if tenant has vault PIN configured
vaultRouter.get("/status", async (c) => {
  const tenantId = c.get("tenantId")

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { vaultPinHash: true },
  })

  return c.json({ hasPin: !!tenant?.vaultPinHash })
})

// POST /api/vault/setup-pin - Create vault PIN (first time)
vaultRouter.post("/setup-pin", async (c) => {
  const tenantId = c.get("tenantId")
  const user = c.get("user")
  const { pin } = await c.req.json()

  if (user.role !== "owner" && user.role !== "admin" && user.role !== "superadmin") {
    return c.json({ error: "Solo administradores pueden configurar el PIN" }, 403)
  }

  if (!pin || typeof pin !== "string" || pin.length < 4 || pin.length > 8) {
    return c.json({ error: "El PIN debe tener entre 4 y 8 caracteres" }, 400)
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { vaultPinHash: true },
  })

  if (tenant?.vaultPinHash) {
    return c.json({ error: "El PIN ya esta configurado. Use change-pin para cambiarlo." }, 409)
  }

  const pinHash = createPinHash(pin)
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { vaultPinHash: pinHash },
  })

  return c.json({ success: true })
})

// PUT /api/vault/change-pin - Change vault PIN (requires current PIN)
vaultRouter.put("/change-pin", async (c) => {
  const tenantId = c.get("tenantId")
  const user = c.get("user")
  const { currentPin, newPin } = await c.req.json()

  if (user.role !== "owner" && user.role !== "admin" && user.role !== "superadmin") {
    return c.json({ error: "Solo administradores pueden cambiar el PIN" }, 403)
  }

  if (!newPin || typeof newPin !== "string" || newPin.length < 4 || newPin.length > 8) {
    return c.json({ error: "El nuevo PIN debe tener entre 4 y 8 caracteres" }, 400)
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { vaultPinHash: true },
  })

  if (!tenant?.vaultPinHash) {
    return c.json({ error: "No hay PIN configurado. Use setup-pin primero." }, 400)
  }

  if (!verifyPin(currentPin, tenant.vaultPinHash)) {
    return c.json({ error: "PIN actual incorrecto" }, 401)
  }

  const pinHash = createPinHash(newPin)
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { vaultPinHash: pinHash },
  })

  return c.json({ success: true })
})

// POST /api/vault/unlock - Verify PIN to access vault
vaultRouter.post("/unlock", async (c) => {
  const tenantId = c.get("tenantId")
  const { pin } = await c.req.json()

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { vaultPinHash: true },
  })

  if (!tenant?.vaultPinHash) {
    return c.json({ error: "No hay PIN configurado" }, 400)
  }

  if (!verifyPin(pin, tenant.vaultPinHash)) {
    return c.json({ error: "PIN incorrecto" }, 401)
  }

  return c.json({ success: true })
})

// GET /api/vault/integrations - List available platforms for tenant
vaultRouter.get("/integrations", async (c) => {
  const tenantId = c.get("tenantId")

  const platforms = await prisma.integrationPlatform.findMany({
    where: { isActive: true },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  })

  const tenantIntegrations = await prisma.tenantIntegration.findMany({
    where: { tenantId },
  })

  const result = platforms.map((p) => {
    const integration = tenantIntegrations.find((ti) => ti.platformId === p.id)
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      icon: p.icon,
      category: p.category,
      fields: p.fields.map((f) => ({
        id: f.id,
        label: f.label,
        fieldKey: f.fieldKey,
        fieldType: f.fieldType,
        required: f.required,
      })),
      isConnected: !!integration,
      isActive: integration?.isActive ?? false,
      connectedAt: integration?.connectedAt ?? null,
    }
  })

  return c.json({ integrations: result })
})

// ---- Encryption helpers ----
const VAULT_KEY = process.env.VAULT_ENCRYPTION_KEY || "default-dev-key-change-in-production!!"

function getEncryptionKey(): Buffer {
  return createHash("sha256").update(VAULT_KEY).digest()
}

function encrypt(text: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  const authTag = cipher.getAuthTag().toString("hex")
  return { encrypted: encrypted + ":" + authTag, iv: iv.toString("hex") }
}

function decrypt(encrypted: string, ivHex: string): string {
  const [data, authTag] = encrypted.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv)
  decipher.setAuthTag(Buffer.from(authTag, "hex"))
  let decrypted = decipher.update(data, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

function maskValue(value: string): string {
  if (value.length <= 4) return "••••"
  return "••••" + value.slice(-4)
}

// PUT /api/vault/integrations/:slug - Save credentials for a platform
vaultRouter.put("/integrations/:slug", async (c) => {
  const tenantId = c.get("tenantId")
  const user = c.get("user")
  const slug = c.req.param("slug")
  const { credentials } = await c.req.json()

  if (user.role !== "owner" && user.role !== "admin" && user.role !== "superadmin") {
    return c.json({ error: "Sin permisos para modificar credenciales" }, 403)
  }

  const platform = await prisma.integrationPlatform.findUnique({
    where: { slug },
    include: { fields: true },
  })

  if (!platform) {
    return c.json({ error: "Plataforma no encontrada" }, 404)
  }

  // Validate required fields
  for (const field of platform.fields) {
    if (field.required && (!credentials[field.fieldKey] || !credentials[field.fieldKey].trim())) {
      return c.json({ error: `El campo "${field.label}" es requerido` }, 400)
    }
  }

  // Only keep known field keys
  const cleanCredentials: Record<string, string> = {}
  for (const field of platform.fields) {
    if (credentials[field.fieldKey]) {
      cleanCredentials[field.fieldKey] = credentials[field.fieldKey]
    }
  }

  const { encrypted, iv } = encrypt(JSON.stringify(cleanCredentials))

  await prisma.tenantIntegration.upsert({
    where: {
      tenantId_platformId: { tenantId, platformId: platform.id },
    },
    create: {
      tenantId,
      platformId: platform.id,
      credentialsEncrypted: encrypted,
      iv,
      isActive: true,
      connectedAt: new Date(),
    },
    update: {
      credentialsEncrypted: encrypted,
      iv,
      isActive: true,
      connectedAt: new Date(),
    },
  })

  return c.json({ success: true })
})

// GET /api/vault/integrations/:slug - Get masked credentials for a platform
vaultRouter.get("/integrations/:slug", async (c) => {
  const tenantId = c.get("tenantId")
  const slug = c.req.param("slug")

  const platform = await prisma.integrationPlatform.findUnique({
    where: { slug },
    include: { fields: { orderBy: { sortOrder: "asc" } } },
  })

  if (!platform) {
    return c.json({ error: "Plataforma no encontrada" }, 404)
  }

  const integration = await prisma.tenantIntegration.findUnique({
    where: {
      tenantId_platformId: { tenantId, platformId: platform.id },
    },
  })

  let maskedCredentials: Record<string, string> = {}
  if (integration) {
    try {
      const decrypted = JSON.parse(decrypt(integration.credentialsEncrypted, integration.iv))
      for (const key of Object.keys(decrypted)) {
        maskedCredentials[key] = maskValue(decrypted[key])
      }
    } catch {
      // corrupted data, return empty
    }
  }

  return c.json({
    platform: {
      id: platform.id,
      name: platform.name,
      slug: platform.slug,
      fields: platform.fields.map((f) => ({
        id: f.id,
        label: f.label,
        fieldKey: f.fieldKey,
        fieldType: f.fieldType,
        required: f.required,
      })),
    },
    maskedCredentials,
    isConnected: !!integration,
  })
})

// DELETE /api/vault/integrations/:slug - Disconnect a platform
vaultRouter.delete("/integrations/:slug", async (c) => {
  const tenantId = c.get("tenantId")
  const user = c.get("user")
  const slug = c.req.param("slug")

  if (user.role !== "owner" && user.role !== "admin" && user.role !== "superadmin") {
    return c.json({ error: "Sin permisos" }, 403)
  }

  const platform = await prisma.integrationPlatform.findUnique({ where: { slug } })
  if (!platform) {
    return c.json({ error: "Plataforma no encontrada" }, 404)
  }

  await prisma.tenantIntegration.deleteMany({
    where: { tenantId, platformId: platform.id },
  })

  return c.json({ success: true })
})

export { vaultRouter as vaultRoutes }
