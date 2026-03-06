import type { RadiusOption } from "../types/content";

interface Props {
  value: RadiusOption["value"];
  onChange: (value: RadiusOption["value"]) => void;
}

const OPTIONS: RadiusOption[] = [
  { value: "1km", label: "1km", distanceKm: 1 },
  { value: "3km", label: "3km", distanceKm: 3 },
  { value: "5km", label: "5km", distanceKm: 5 },
  { value: "bounds", label: "지도 영역", distanceKm: null },
];

export function RadiusFilter({ value, onChange }: Props) {
  return (
    <div className="segmented-control" role="group" aria-label="반경 필터">
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
