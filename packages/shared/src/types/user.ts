export type UserRole = "superadmin" | "owner" | "admin" | "analyst" | "viewer"

export interface User {
  id: string
  tenantId: string | null
  firebaseUid: string
  email: string
  name?: string
  role: UserRole
  approved: boolean
  emailVerified: boolean
  permissions: Record<string, boolean>
}

export interface AuthContext {
  user: User
  tenantId: string
}
