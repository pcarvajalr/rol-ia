import { create } from "zustand"
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth"
import { auth } from "@/lib/firebase"

interface AppUser {
  id: string
  tenantId: string
  firebaseUid: string
  email: string
  role: string
  permissions: Record<string, boolean>
}

interface AuthState {
  firebaseUser: FirebaseUser | null
  user: AppUser | null
  token: string | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  init: () => () => void
}

const API_URL = import.meta.env.VITE_API_URL || ""

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  user: null,
  token: null,
  loading: true,
  error: null,

  login: async (email, password) => {
    set({ error: null, loading: true })
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch {
      set({ error: "Credenciales invalidas", loading: false })
      throw new Error("Credenciales invalidas")
    }
  },

  logout: async () => {
    await signOut(auth)
    set({ firebaseUser: null, user: null, token: null })
  },

  init: () => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken()
        try {
          const res = await fetch(`${API_URL}/api/me`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.ok) {
            const { user } = await res.json()
            set({ firebaseUser, user, token, loading: false })
          } else {
            set({ firebaseUser, user: null, token, loading: false })
          }
        } catch {
          set({ firebaseUser, user: null, token, loading: false })
        }
      } else {
        set({ firebaseUser: null, user: null, token: null, loading: false })
      }
    })
    return unsubscribe
  },
}))
