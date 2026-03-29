import { validateCredentials } from "../utils/encryption"

export async function makeOutboundCall(
  tenantId: string,
  phoneNumber: string
): Promise<void> {
  const credentials = await validateCredentials(tenantId, "vapi", [
    "assistant_id",
    "auth_token",
    "phone_number_id",
  ])

  const response = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credentials.auth_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assistantId: credentials.assistant_id,
      phoneNumberId: credentials.phone_number_id,
      customer: { number: phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}` },
    }),
  })

  const responseBody = await response.text()

  if (!response.ok) {
    throw new Error(`Error VAPI call: ${response.status} - ${responseBody}`)
  }

  console.log(`[vapi] Outbound call initiated to ${phoneNumber} for tenant ${tenantId}. Response:`, responseBody)
}
