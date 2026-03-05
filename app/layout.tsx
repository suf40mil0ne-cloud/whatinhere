import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "whatinhere",
  description: "공사/개발 프로젝트 지도",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
