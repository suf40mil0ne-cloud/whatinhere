interface Props {
  value: string;
  onChange: (value: string) => void;
}

const OPTIONS = [
  { value: "all", label: "전체 상태" },
  { value: "permit", label: "허가" },
  { value: "start", label: "착공" },
  { value: "approval", label: "사용승인" },
  { value: "unknown", label: "미확인" },
];

export function StatusFilter({ value, onChange }: Props) {
  return (
    <div className="segmented-control" role="group" aria-label="상태 필터">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? "is-active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
