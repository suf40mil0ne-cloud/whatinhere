export interface RawTransport {
  busStopCount500m: number | null;
  busStopDistanceM: number | null;
  subwayStationDistanceM: number | null;
  subwayTransferCount1km: number | null;
}
export interface RawWalk {
  parkCount1km: number | null;
  parkArea1km: number | null;
  parkDistanceM: number | null;
  parkFacilityCount: number | null;
}
export interface RawValue {
  pricePerSqmMedian: number | null;
}
export interface RawChildcare {
  childcareCount: number | null;
  capacityLeft1km: number | null;
  elementaryDistanceM: number | null;
  academyCount1km: number | null;
  academyDiversityScore: number | null;
  vehicleRatio: number | null;
}
export interface RawSafety {
  cctvCount500m: number | null;
  cctvDistanceM: number | null;
  childZoneCount1km: number | null;
  safetyIndexScore: number | null;
}

export type DistrictStatKey = "transport" | "walk" | "value" | "childcare" | "safety";

export interface DistrictRecord {
  code: string;         // was admCd
  sido: string;
  sigungu: string;      // was sgg
  dong: string;         // was admNm
  center: { lat: number | null; lng: number | null };
  households: number | null;
  population: number | null;
  scores: {
    transport: number;
    walk: number;
    value: number;
    childcare: number;
    safety: number;
    overall: number;
  };
  rawTransport: RawTransport | null;
  rawWalk: RawWalk | null;
  rawValue: RawValue | null;
  rawChildcare: RawChildcare | null;
  rawSafety: RawSafety | null;
}

export interface AptRecord {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  districtCode: string | null;
  builtYear: number | null;
  totalUnits: number | null;
  avgPricePerM2: number | null;
  scores: {
    transport: number;
    walk: number;
    value: number;
    childcare: number;
    safety: number;
  };
  rawTransport: RawTransport | null;
  rawWalk: RawWalk | null;
  rawValue: RawValue | null;
  rawChildcare: RawChildcare | null;
  rawSafety: RawSafety | null;
}

export interface AptComment {
  id: string;
  aptId: string;
  category: string | null;
  comment: string;
  userScore: number | null;
  likes: number;
  createdAt: string;
}

export interface DistrictApiResponse {
  total: number;
  districts: DistrictRecord[];
}

export interface AptApiResponse {
  total: number;
  apts: AptRecord[];
}
