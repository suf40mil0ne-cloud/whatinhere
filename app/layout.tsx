import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "여기 뭐 생겨요?",
  description: "지도에서 공사/개발 프로젝트를 확인하는 서비스",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
