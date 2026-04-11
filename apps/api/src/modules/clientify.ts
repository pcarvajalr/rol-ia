import { validateCredentials } from "../utils/encryption"
import { prisma } from "../db/client"

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
  owner?: string
}

interface NormalizedLead {
  externalId: string
  nombreLead: string
  fuente: string
  telefono: string | null
  email: string | null
  status: string | null
  owner: string | null
}

interface ClientifyUser {
  username?: string
  email?: string
  first_name?: string
  last_name?: string
  phone?: string
  mobile?: string
  phones?: Array<{ phone: string }>
}

interface ClientifyUsersResponse {
  count: number
  next: string | null
  previous: string | null
  results: ClientifyUser[]
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
    status: payload.status || null,
    owner: payload.owner || null,
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

export async function syncTenantVendedores(
  tenantId: string,
  apiToken: string
): Promise<Array<{ id: string; email: string }>> {
  const response = await fetch("https://api.clientify.net/v1/users/", {
    headers: { Authorization: `Token ${apiToken}` },
  })

  if (!response.ok) {
    console.error(`[clientify] Error consultando usuarios: ${response.status}`)
    return []
  }

  const body = (await response.json()) as ClientifyUsersResponse
  const users = body.results ?? []

  const results: Array<{ id: string; email: string }> = []

  for (const user of users) {
    const email = user.username || user.email
    if (!email) continue

    const nombre = [user.first_name, user.last_name].filter(Boolean).join(" ") || email
    const telefono = user.phone || user.mobile || user.phones?.[0]?.phone || null

    const vendedor = await prisma.vendedor.upsert({
      where: {
        tenantId_email: { tenantId, email },
      },
      update: { nombre, telefono },
      create: { tenantId, email, nombre, telefono },
    })

    results.push({ id: vendedor.id, email: vendedor.email })
  }

  console.log(`[clientify] Sync vendedores tenant ${tenantId}: ${results.length} usuarios`)
  return results
}
