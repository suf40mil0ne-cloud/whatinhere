import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setToken } from "../lib/auth";

export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get("token");
    if (token) {
      setToken(token);
    }
    const returnTo = sessionStorage.getItem("danjiwar_return") ?? "/";
    sessionStorage.removeItem("danjiwar_return");
    navigate(returnTo, { replace: true });
  }, [params, navigate]);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
      <p style={{ color: "var(--muted)" }}>로그인 중...</p>
    </div>
  );
}
