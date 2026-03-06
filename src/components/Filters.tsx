interface Props {
  status: string;
  useType: string;
  sort: string;
  onChange: (next: { status?: string; useType?: string; sort?: string }) => void;
}

const STATUSES = ["전체", "접수", "허가", "착공준비", "착공", "공사중", "사용승인", "준공/완료", "정보부족"];
const USES = ["전체", "공동주택", "업무시설", "근린생활시설", "물류시설", "의료시설", "교육연구시설"];
const SORTS = [
  { key: "permit_desc", label: "최근 허가순" },
  { key: "start_desc", label: "최근 착공순" },
  { key: "gfa_desc", label: "연면적 큰순" },
];

export function Filters({ status, useType, sort, onChange }: Props) {
  return (
    <div className="filters-box">
      <select value={status} onChange={(e) => onChange({ status: e.target.value })}>
        {STATUSES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <select value={useType} onChange={(e) => onChange({ useType: e.target.value })}>
        {USES.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>

      <select value={sort} onChange={(e) => onChange({ sort: e.target.value })}>
        {SORTS.map((v) => (
          <option key={v.key} value={v.key}>
            {v.label}
          </option>
        ))}
      </select>
    </div>
  );
}
