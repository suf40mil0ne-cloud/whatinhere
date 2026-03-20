import type { ProjectCategory } from "../lib/project-types";
import { CATEGORY_OPTIONS } from "../lib/project-utils";

interface Props {
  activeCategories: ProjectCategory[];
  onChange: (categories: ProjectCategory[]) => void;
}

export function CategoryFilter({ activeCategories, onChange }: Props) {
  function toggleCategory(category: ProjectCategory) {
    const nextCategories = activeCategories.includes(category)
      ? activeCategories.filter((value) => value !== category)
      : [...activeCategories, category];

    onChange(nextCategories.length === 0 ? [category] : nextCategories);
  }

  return (
    <div className="category-filter" aria-label="카테고리 필터">
      {CATEGORY_OPTIONS.map((option) => {
        const isActive = activeCategories.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            className={isActive ? "chip chip-active" : "chip"}
            onClick={() => toggleCategory(option.value)}
          >
            <span className="chip-dot" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
