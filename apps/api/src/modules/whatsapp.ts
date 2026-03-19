import { prisma } from "../db/client"
import { validateCredentials, decrypt } from "../utils/encryption"
import { createHmac } from "crypto"

// ---- Template functions ----

interface TemplateComponent {
  type: string
  parameters?: Array<{ type: string; text?: string }>
  sub_type?: string
  index?: string
}

interface TemplateInfo {
  components: TemplateComponent[]
  language: string
}

export async function getTemplateStructure(
  tenantId: string,
  templateName: string
): Promise<TemplateInfo> {
  const credentials = await validateCredentials(tenantId, "whatsapp", ["account_id", "access_token"])

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${credentials.account_id}/message_templates?name=${templateName}`,
    { headers: { Authorization: `Bearer ${credentials.access_token}` } }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Error consultando template ${templateName}: ${response.status} - ${error}`)
  }

  const data = (await response.json()) as {
    data: Array<{ components: TemplateComponent[]; language: string }>
  }

  if (!data.data?.length) {
    throw new Error(`Template "${templateName}" no encontrado`)
  }

  return {
    components: data.data[0].components,
    language: data.data[0].language,
  }
}

export async function sendTemplate(
  tenantId: string,
  to: string,
  templateName: string,
  _languageCode: string,
  params: Record<string, string>
): Promise<void> {
  const credentials = await validateCredentials(tenantId, "whatsapp", [
    "phone_number_id",
    "access_token",
  ])

  console.log(`[whatsapp] Usando phone_number_id: ${credentials.phone_number_id} para tenant ${tenantId}`)

  // Obtener estructura y idioma real del template
  const templateInfo = await getTemplateStructure(tenantId, templateName)
  const templateComponents = templateInfo.components
  const languageCode = templateInfo.language

  // Construir components con parámetros
  const components: TemplateComponent[] = []
  const paramValues = Object.values(params)
  let paramIndex = 0

  for (const comp of templateComponents) {
    if (comp.type === "HEADER" || comp.type === "BODY") {
      const text = (comp as unknown as { text?: string }).text || ""
      const paramCount = (text.match(/\{\{\d+\}\}/g) || []).length

      if (paramCount > 0) {
        const parameters = []
        for (let i = 0; i < paramCount; i++) {
          parameters.push({
            type: "text" as const,
            text: paramValues[paramIndex] || "",
          })
          paramIndex++
        }
        components.push({
          type: comp.type.toLowerCase(),
          parameters,
        })
      }
    }
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      }),
    }
  )

  if (!response.ok) {
    const errorData = (await response.json()) as {
      error?: { code?: number; message?: string }
    }
    const errorCode = errorData.error?.code
    const errorMessage = errorData.error?.message || "Unknown error"

    if (errorCode === 131026 || errorCode === 131021) {
      const err = new Error(`Número de WhatsApp inválido: ${errorMessage}`) as Error & {
        code: string
      }
      err.code = "INVALID_NUMBER"
      throw err
    }

    throw new Error(`Error enviando template: ${errorCode} - ${errorMessage}`)
  }

  console.log(`[whatsapp] Template "${templateName}" enviado a ${to} para tenant ${tenantId}`)
}

// ---- Text message ----

export async function sendTextMessage(
  tenantId: string,
  to: string,
  text: string
): Promise<void> {
  const credentials = await validateCredentials(tenantId, "whatsapp", [
    "phone_number_id",
    "access_token",
  ])

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${credentials.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Error enviando mensaje de texto: ${response.status} - ${error}`)
  }

  console.log(`[whatsapp] Text message sent to ${to} for tenant ${tenantId}`)
}

// ---- Webhook parsing ----

interface MetaWebhookResult {
  type: "button_reply" | "text" | "unknown"
  buttonId?: string
  from: string
  phoneNumberId: string
}

export function parseWebhookPayload(body: unknown): MetaWebhookResult | null {
  const data = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string }
          messages?: Array<{
            type?: string
            from?: string
            interactive?: {
              type?: string
              button_reply?: { id?: string; title?: string }
            }
            button?: { payload?: string; text?: string }
            text?: { body?: string }
          }>
        }
      }>
    }>
  }

  const entry = data?.entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value
  const message = value?.messages?.[0]

  if (!message || !value?.metadata?.phone_number_id) {
    return null
  }

  const result: MetaWebhookResult = {
    type: "unknown",
    from: message.from || "",
    phoneNumberId: value.metadata.phone_number_id,
  }

  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    result.type = "button_reply"
    result.buttonId = message.interactive.button_reply?.id
  } else if (message.type === "button" && message.button) {
    // Botones de template Quick Reply — Meta envía payload/text en vez de interactive
    result.type = "button_reply"
    result.buttonId = message.button.payload || message.button.text
  } else if (message.type === "text") {
    result.type = "text"
  }

  return result
}

// ---- Tenant identification ----

export async function findTenantByPhoneNumberId(
  phoneNumberId: string
): Promise<string | null> {
  const platform = await prisma.integrationPlatform.findUnique({
    where: { slug: "whatsapp" },
  })

  if (!platform) return null

  const integrations = await prisma.tenantIntegration.findMany({
    where: {
      platformId: platform.id,
      isActive: true,
    },
    select: {
      tenantId: true,
      credentialsEncrypted: true,
      iv: true,
    },
  })

  for (const integration of integrations) {
    try {
      const credentials = JSON.parse(
        decrypt(integration.credentialsEncrypted, integration.iv)
      ) as Record<string, string>

      if (credentials.phone_number_id === phoneNumberId) {
        return integration.tenantId
      }
    } catch {
      continue
    }
  }

  return null
}

// ---- Webhook signature validation ----

export function validateWebhookSignature(
  body: string,
  signature: string,
  appSecret: string
): boolean {
  const expectedSignature =
    "sha256=" + createHmac("sha256", appSecret).update(body).digest("hex")
  return signature === expectedSignature
}
