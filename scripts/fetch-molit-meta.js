import { createDiagnosticContext, finalizeDiagnostic, recordFailure } from "./source-diagnostics.js";
import { runScript } from "./run-script.js";

const { report } = createDiagnosticContext({
  sourceKey: "molit-meta",
  sourceName: "국토교통부 보강 메타데이터 레이어",
  sourceUrl: "https://www.data.go.kr/",
  strategy: "A/B",
  endpointType: "composite-ingest",
  notes: [
    "국토부 보강 메타데이터 레이어는 철도공단사업, 택지정보, 실시계획인가정보를 순차 실행한다.",
    "국토부 공사정보 목록 API는 현재 저장소에 endpoint 및 인증 구성이 없어 진단 로그만 남긴다.",
  ],
});

recordFailure(report, "molit-construction-list-not-configured");

runScript("scripts/fetch-railway.js");
runScript("scripts/fetch-housing.js");
runScript("scripts/fetch-urban-plan.js");

report.fetchAttempted = true;
report.fetchSucceeded = true;
finalizeDiagnostic(report);
