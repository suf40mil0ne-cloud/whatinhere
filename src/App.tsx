import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SiteLayout } from "./components/SiteLayout";
import { HomePage } from "./pages/HomePage";
import { BattlePage } from "./pages/BattlePage";
import { BattleResultPage } from "./pages/BattleResultPage";
import { RankingPage } from "./pages/RankingPage";
import { HotPage } from "./pages/HotPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 홈 - 지도 페이지는 레이아웃 없이 */}
        <Route path="/" element={<HomePage />} />

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
      </Routes>
    </BrowserRouter>
  );
}
