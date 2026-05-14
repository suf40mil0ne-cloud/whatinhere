import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./components/AuthProvider";
import { SiteLayout } from "./components/SiteLayout";
import { HomePage } from "./pages/HomePage";
import { BattlePage } from "./pages/BattlePage";
import { BattleResultPage } from "./pages/BattleResultPage";
import { RankingPage } from "./pages/RankingPage";
import { MyAptPage } from "./pages/MyAptPage";
import { TrendPage } from "./pages/TrendPage";
import { HotPage } from "./pages/HotPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { AdminPage } from "./pages/AdminPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { AboutPage } from "./pages/AboutPage";
import { CommentsPage } from "./pages/CommentsPage";
import { AptDetailPage } from "./pages/AptDetailPage";
import { NotFoundPage } from "./pages/NotFoundPage";

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
            path="/my-apt"
            element={
              <SiteLayout>
                <MyAptPage />
              </SiteLayout>
            }
          />
          <Route
            path="/trend"
            element={
              <SiteLayout>
                <TrendPage />
              </SiteLayout>
            }
          />
          <Route
            path="/comments"
            element={
              <SiteLayout>
                <CommentsPage />
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

          <Route
            path="/apt/:aptId"
            element={
              <SiteLayout>
                <AptDetailPage />
              </SiteLayout>
            }
          />

          <Route path="/admin" element={<AdminPage />} />

          <Route
            path="/privacy"
            element={
              <SiteLayout>
                <PrivacyPage />
              </SiteLayout>
            }
          />
          <Route
            path="/terms"
            element={
              <SiteLayout>
                <TermsPage />
              </SiteLayout>
            }
          />
          <Route
            path="/about"
            element={
              <SiteLayout>
                <AboutPage />
              </SiteLayout>
            }
          />
          <Route
            path="*"
            element={
              <SiteLayout>
                <NotFoundPage />
              </SiteLayout>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
