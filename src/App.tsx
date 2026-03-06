import { Navigate, Route, Routes } from "react-router-dom";
import { SiteLayout } from "./components/SiteLayout";
import { AboutPage } from "./pages/AboutPage";
import { AreaPage } from "./pages/AreaPage";
import { ContactPage } from "./pages/ContactPage";
import { DataSourcesPage } from "./pages/DataSourcesPage";
import { DisclaimerPage } from "./pages/DisclaimerPage";
import { FaqPage } from "./pages/FaqPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { ProjectPage } from "./pages/ProjectPage";
import { TermsPage } from "./pages/TermsPage";

export function App() {
  return (
    <SiteLayout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/area/:areaSlug" element={<AreaPage />} />
        <Route path="/project/:slug" element={<ProjectPage />} />
        <Route path="/data-sources" element={<DataSourcesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/disclaimer" element={<DisclaimerPage />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </SiteLayout>
  );
}
