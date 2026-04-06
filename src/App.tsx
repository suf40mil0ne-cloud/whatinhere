import { BrowserRouter, Routes, Route } from "react-router-dom";
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
      <Routes>
        {/* 메인 - 대결 페이지 */}
        <Route
          path="/"
          element={
            <SiteLayout>
              <BattlePage />
            </SiteLayout>
          }
        />

        {/* 지도 */}
        <Route path="/map" element={<HomePage />} />

        {/* 카카오 OAuth 콜백 */}
        <Route path="/auth/kakao/callback" element={<AuthCallbackPage />} />

        {/* 레이아웃 있는 페이지들 */}
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

        {/* 관리자 (숨김) */}
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}
