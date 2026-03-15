import { validateCredentials } from "../utils/encryption"

interface ClientifyWebhookBody {
  hook?: { id: number; event: string; target: string }
  data?: ClientifyContact
}

interface ClientifyContact {
  id: number
  first_name: string
  last_name?: string
  emails?: Array<{ email: string }>
  phones?: Array<{ phone: string }>
  status?: string
  contact_source?: string
  company?: string
  custom_fields?: unknown[]
}

interface NormalizedLead {
  externalId: string
  nombreLead: string
  fuente: string
  telefono: string | null
  email: string | null
}

export function parseClientifyPayload(body: unknown): NormalizedLead {
  const raw = body as ClientifyWebhookBody

  // Clientify envía { hook: {...}, data: {...} } — el contacto está en data
  const payload = raw?.data || (raw as unknown as ClientifyContact)

  if (!payload?.id || !payload?.first_name) {
    throw new Error("Payload inválido: se requiere id y first_name")
  }

  return {
    externalId: String(payload.id),
    nombreLead: [payload.first_name, payload.last_name].filter(Boolean).join(" "),
    fuente: payload.contact_source || "Clientify",
    telefono: payload.phones?.[0]?.phone || null,
    email: payload.emails?.[0]?.email || null,
  }
}

export async function queryContactStatus(
  tenantId: string,
  externalId: string
): Promise<string | null> {
  const credentials = await validateCredentials(tenantId, "clientify", ["api_token"])

  const response = await fetch(`https://api.clientify.net/v1/contacts/${externalId}/`, {
    headers: { Authorization: `Token ${credentials.api_token}` },
  })

  if (!response.ok) {
    console.error(`[clientify] Error consultando contacto ${externalId}: ${response.status}`)
    return null
  }

  const data = (await response.json()) as { status?: string }
  return data.status || null
}
