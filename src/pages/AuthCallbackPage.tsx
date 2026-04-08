import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { consumeReturnTo, forwardKakaoCode } from "../lib/auth";

export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();

  useEffect(() => {
    const code = params.get("code");
    const error = params.get("error");
    console.info("[auth-ui] callback entry", { hasCode: Boolean(code), hasError: Boolean(error) });

    if (error) {
      navigate(consumeReturnTo(), { replace: true });
      return;
    }

    if (code) {
      forwardKakaoCode(code);
      return;
    }

    const returnTo = consumeReturnTo();
    let active = true;

    void refreshAuth().finally(() => {
      console.info("[auth-ui] callback refresh complete");
      if (active) {
        navigate(returnTo, { replace: true });
      }
    });

    return () => {
      active = false;
    };
  }, [navigate, params, refreshAuth]);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
      <p style={{ color: "var(--muted)" }}>로그인 처리 중...</p>
    </div>
  );
}
