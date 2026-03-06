import { useState } from "react";

interface Props {
  onSearch: (q: string) => void;
}

export function SearchBox({ onSearch }: Props) {
  const [keyword, setKeyword] = useState("");

  return (
    <div className="search-box">
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="주소/지번/키워드 검색 (예: 킨텍스, 아파트, 물류센터)"
      />
      <button onClick={() => onSearch(keyword.trim())}>검색</button>
    </div>
  );
}
