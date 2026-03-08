import { create } from "zustand"
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth"
import { auth } from "@/lib/firebase"

export type AuthStatus =
  | "loading"
  | "unauthenticated"
  | "pending_verification"
  | "pending_approval"
  | "active"
  | "superadmin"

export interface AppUser {
  id: string
  tenantId: string | null
  firebaseUid: string
  email: string
  name: string
  role: string
  approved: boolean
  permissions: Record<string, boolean>
}

interface AuthState {
  authStatus: AuthStatus
  firebaseUser: FirebaseUser | null
  user: AppUser | null
  token: string | null
  error: string | null
  _registering: boolean

  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  register: (
    email: string,
    password: string,
    tenantName: string,
    tenantSlug: string,
  ) => Promise<void>
  verifyEmail: () => Promise<void>
  resendVerification: () => Promise<void>
  checkStatus: () => Promise<void>
  init: () => () => void
}

const API_URL = import.meta.env.VITE_API_URL || ""

export const useAuthStore = create<AuthState>((set, get) => ({
  authStatus: "loading",
  firebaseUser: null,
  user: null,
  token: null,
  error: null,
  _registering: false,

  login: async (email, password) => {
    set({ error: null })
    try {
      await signInWithEmailAndPassword(auth, email, password)
      // onAuthStateChanged will trigger checkStatus
    } catch {
      set({ error: "Credenciales invalidas", authStatus: "unauthenticated" })
      throw new Error("Credenciales invalidas")
    }
  },

  logout: async () => {
    await signOut(auth)
    set({
      firebaseUser: null,
      user: null,
      token: null,
      authStatus: "unauthenticated",
      error: null,
    })
  },

  register: async (email, password, tenantName, tenantSlug) => {
    set({ error: null, _registering: true })
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      )
      await sendEmailVerification(credential.user)

      const token = await credential.user.getIdToken()

      await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ tenantName, tenantSlug }),
      })

      set({
        firebaseUser: credential.user,
        token,
        authStatus: "pending_verification",
        _registering: false,
      })
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error al registrar cuenta"
      set({ error: message, authStatus: "unauthenticated", _registering: false })
      throw err
    }
  },

  verifyEmail: async () => {
    set({ error: null })
    const { firebaseUser } = get()
    if (!firebaseUser) return

    try {
      await firebaseUser.reload()
      const token = await firebaseUser.getIdToken(true)

      await fetch(`${API_URL}/auth/verify-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })

      set({ token })
      await get().checkStatus()
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Error al verificar correo"
      set({ error: message })
    }
  },

  resendVerification: async () => {
    set({ error: null })
    const { firebaseUser } = get()
    if (!firebaseUser) return

    try {
      await sendEmailVerification(firebaseUser)
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Error al reenviar correo de verificacion"
      set({ error: message })
    }
  },

  checkStatus: async () => {
    const { firebaseUser } = get()
    if (!firebaseUser) {
      set({ authStatus: "unauthenticated", user: null, token: null })
      return
    }

    try {
      const token = await firebaseUser.getIdToken()
      set({ token })

      const res = await fetch(`${API_URL}/auth/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        set({ authStatus: "unauthenticated", user: null })
        return
      }

      const data = await res.json()

      if (!data.registered) {
        set({ authStatus: "unauthenticated", user: null })
        return
      }

      if (!data.emailVerified) {
        set({ authStatus: "pending_verification", user: null })
        return
      }

      if (!data.approved) {
        set({ authStatus: "pending_approval", user: null })
        return
      }

      // User is approved — fetch full profile
      try {
        const meRes = await fetch(`${API_URL}/api/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (meRes.ok) {
          const { user } = await meRes.json()
          const status: AuthStatus =
            user.role === "superadmin" ? "superadmin" : "active"
          set({ authStatus: status, user })
          return
        }
      } catch {
        // fall through to role-based check
      }

      const status: AuthStatus =
        data.role === "superadmin" ? "superadmin" : "active"
      set({ authStatus: status, user: data.user ?? null })
    } catch {
      set({ authStatus: "unauthenticated", user: null })
    }
  },

  init: () => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Skip if register() is in progress — it manages its own state
        if (get()._registering) {
          set({ firebaseUser })
          return
        }
        set({ firebaseUser, authStatus: "loading" })
        await get().checkStatus()
      } else {
        set({
          firebaseUser: null,
          user: null,
          token: null,
          authStatus: "unauthenticated",
        })
      }
    })
    return unsubscribe
  },
}))
