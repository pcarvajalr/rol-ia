import { validateCredentials } from "../utils/encryption"

interface ClientifyPayload {
  id: number
  first_name: string
  last_name?: string
  email?: string
  phone?: string
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
  const payload = body as ClientifyPayload

  if (!payload?.id || !payload?.first_name) {
    throw new Error("Payload inválido: se requiere id y first_name")
  }

  return {
    externalId: String(payload.id),
    nombreLead: [payload.first_name, payload.last_name].filter(Boolean).join(" "),
    fuente: payload.contact_source || "Clientify",
    telefono: payload.phone || null,
    email: payload.email || null,
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
