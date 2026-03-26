import { createHmac } from "crypto"

interface CalcomAttendee {
  name: string
  email: string
  phone?: string
}

interface CalcomBookingPayload {
  uid: string
  title: string
  startTime: string
  endTime: string
  attendees: CalcomAttendee[]
  additionalNotes?: string
  responses?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

interface CalcomWebhookEvent {
  triggerEvent: string
  payload: CalcomBookingPayload
}

export interface ParsedCalcomBooking {
  triggerEvent: string
  bookingUid: string
  startTime: Date
  endTime: Date
  attendeePhone: string | null
  attendeeEmail: string | null
  attendeeName: string | null
  notes: string | null
}

export function parseCalcomWebhook(body: unknown): ParsedCalcomBooking | null {
  const event = body as CalcomWebhookEvent
  if (!event?.triggerEvent || !event?.payload?.uid) return null

  const attendee = event.payload.attendees?.[0]

  // Cal.com envía el teléfono en diferentes ubicaciones según la config del evento:
  // 1. attendee.phone (si tiene campo phone nativo)
  // 2. responses.phone / responses.Phone number / responses.smsReminderNumber
  // 3. responses con keys que contengan "phone", "telefono", "celular", "whatsapp"
  let phone = attendee?.phone || null

  if (!phone && event.payload.responses) {
    const responses = event.payload.responses

    // Cal.com responses pueden ser string directos o objetos { label, value, isHidden }
    const extractValue = (entry: unknown): string | null => {
      if (typeof entry === "string") return entry
      if (entry && typeof entry === "object" && "value" in entry) {
        const val = (entry as Record<string, unknown>).value
        if (typeof val === "string") return val
      }
      return null
    }

    // Buscar por keys conocidas de Cal.com
    const phoneKeys = ["attendeePhoneNumber", "phone", "Phone number", "smsReminderNumber", "telefono", "celular", "whatsapp"]
    for (const key of phoneKeys) {
      if (responses[key]) {
        const val = extractValue(responses[key])
        if (val) { phone = val; break }
      }
    }

    // Fallback: buscar por key que contenga "phone" o "telefono"
    if (!phone) {
      for (const [key, entry] of Object.entries(responses)) {
        if (/phone|telefono|celular|whatsapp/i.test(key)) {
          const val = extractValue(entry)
          if (val) { phone = val; break }
        }
      }
    }
  }

  if (phone) {
    phone = phone.replace(/[\s\-()]/g, "")
    if (!phone.startsWith("+")) phone = `+${phone}`
  }

  console.log(`[calcom] Parsed attendee: ${attendee?.name}, phone: ${phone}, responses: ${JSON.stringify(event.payload.responses)}`)

  return {
    triggerEvent: event.triggerEvent,
    bookingUid: event.payload.uid,
    startTime: new Date(event.payload.startTime),
    endTime: new Date(event.payload.endTime),
    attendeePhone: phone,
    attendeeEmail: attendee?.email || null,
    attendeeName: attendee?.name || null,
    notes: event.payload.additionalNotes || null,
  }
}

export function validateCalcomSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex")
  return signature === expected
}
