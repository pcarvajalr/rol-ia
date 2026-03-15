import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto"
import { prisma } from "../db/client"

const VAULT_KEY = process.env.VAULT_ENCRYPTION_KEY || "default-dev-key-change-in-production!!"

function getEncryptionKey(): Buffer {
  return createHash("sha256").update(VAULT_KEY).digest()
}

export function encrypt(text: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  const authTag = cipher.getAuthTag().toString("hex")
  return { encrypted: encrypted + ":" + authTag, iv: iv.toString("hex") }
}

export function decrypt(encrypted: string, ivHex: string): string {
  const [data, authTag] = encrypted.split(":")
  const iv = Buffer.from(ivHex, "hex")
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv)
  decipher.setAuthTag(Buffer.from(authTag!, "hex"))
  let decrypted = decipher.update(data!, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

export async function validateCredentials(
  tenantId: string,
  platformSlug: string,
  requiredFields: string[]
): Promise<Record<string, string>> {
  const platform = await prisma.integrationPlatform.findUnique({
    where: { slug: platformSlug },
  })

  if (!platform) {
    throw new Error(`Plataforma "${platformSlug}" no encontrada`)
  }

  const integration = await prisma.tenantIntegration.findUnique({
    where: {
      tenantId_platformId: { tenantId, platformId: platform.id },
    },
  })

  if (!integration || !integration.isActive) {
    throw new Error(`Integración "${platformSlug}" no activa para tenant ${tenantId}`)
  }

  const credentials = JSON.parse(decrypt(integration.credentialsEncrypted, integration.iv)) as Record<string, string>

  for (const field of requiredFields) {
    if (!credentials[field]) {
      throw new Error(`Campo "${field}" faltante en credenciales de "${platformSlug}"`)
    }
  }

  return credentials
}
