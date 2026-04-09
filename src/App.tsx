import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./components/AuthProvider";
import { SiteLayout } from "./components/SiteLayout";
import { HomePage } from "./pages/HomePage";
import { BattlePage } from "./pages/BattlePage";
import { BattleResultPage } from "./pages/BattleResultPage";
import { RankingPage } from "./pages/RankingPage";
import { HotPage } from "./pages/HotPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { AdminPage } from "./pages/AdminPage";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/"
            element={
              <SiteLayout>
                <BattlePage />
              </SiteLayout>
            }
          />

          <Route path="/map" element={<HomePage />} />
          <Route path="/auth/kakao/callback" element={<AuthCallbackPage />} />

          <Route
            path="/battle"
            element={
              <SiteLayout>
                <BattlePage />
              </SiteLayout>
            }
          />
          <Route
            path="/battle/:id"
            element={
              <SiteLayout>
                <BattleResultPage />
              </SiteLayout>
            }
          />
          <Route
            path="/ranking"
            element={
              <SiteLayout>
                <RankingPage />
              </SiteLayout>
            }
          />
          <Route
            path="/hot"
            element={
              <SiteLayout>
                <HotPage />
              </SiteLayout>
            }
          />

          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
