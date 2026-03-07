export interface Tenant {
  id: string
  name: string
  slug: string
  plan: "free" | "pro" | "enterprise"
  settings: Record<string, unknown>
  active: boolean
  createdAt: Date
}
