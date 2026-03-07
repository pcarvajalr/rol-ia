import { useNavigate } from "react-router"
import { LoginScreen } from "@/components/login-screen"

export function LoginPage() {
  const navigate = useNavigate()

  return (
    <LoginScreen onAuthenticated={() => navigate("/dashboard")} />
  )
}
