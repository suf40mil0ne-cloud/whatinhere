const STATUS_RULES: Array<{ pattern: RegExp; normalized: string }> = [
  { pattern: /(접수|신청)/, normalized: "접수" },
  { pattern: /(허가|승인완료)/, normalized: "허가" },
  { pattern: /(착공준비|착공예정)/, normalized: "착공준비" },
  { pattern: /(착공)/, normalized: "착공" },
  { pattern: /(공사중|시공중)/, normalized: "공사중" },
  { pattern: /(사용승인|준공검사)/, normalized: "사용승인" },
  { pattern: /(준공|완료|사용개시)/, normalized: "준공/완료" },
];

export function normalizeStatus(rawStatus?: string, startDate?: string | null, approvalDate?: string | null): string {
  if (rawStatus) {
    const normalized = STATUS_RULES.find((rule) => rule.pattern.test(rawStatus));
    if (normalized) return normalized.normalized;
  }

  if (approvalDate) return "사용승인";
  if (startDate) return "공사중";
  return "정보부족";
}
