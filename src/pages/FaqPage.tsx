import { FAQS } from "../data/projects";
import { usePageMeta } from "../hooks/usePageMeta";

export function FaqPage() {
  usePageMeta({
    title: "FAQ | 여기 뭐 생겨요?",
    description: "데이터 출처, 정확도, 업데이트, 광고 정책, 제보 방법 등 자주 묻는 질문을 확인하세요.",
    canonicalPath: "/faq",
  });

  return (
    <div className="page">
      <h1>자주 묻는 질문</h1>
      <div className="faq-list">
        {FAQS.map((faq) => (
          <details key={faq.q} open>
            <summary>{faq.q}</summary>
            <p>{faq.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
