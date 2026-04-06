import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AptPanel } from "../components/AptPanel";
import { DistrictMap } from "../components/DistrictMap";
import { DistrictPanel } from "../components/DistrictPanel";
import { useMapState } from "../hooks/useMapState";
import type { AptRecord, DistrictRecord } from "../lib/district-types";

export function HomePage() {
  const {
    currentLocation,
    locationRequestId,
    locationError,
    handleUseCurrentLocation,
    handleViewportChange,
  } = useMapState(true);

  const [districts, setDistricts] = useState<DistrictRecord[]>([]);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string | null>(null);
  const [selectedApt, setSelectedApt] = useState<AptRecord | null>(null);

  const selectedDistrict = districts.find((district) => district.code === selectedDistrictId) ?? null;

  useEffect(() => {
    if (!selectedDistrictId) return;
    if (!districts.some((district) => district.code === selectedDistrictId)) {
      setSelectedDistrictId(null);
    }
  }, [districts, selectedDistrictId]);

  return (
    <main className="district-home">
      <header className="district-topbar">
        <div>
          <p className="district-topbar-kicker">동네스탯</p>
          <h1>단지戰</h1>
        </div>
        <nav className="district-topbar-nav">
          <Link to="/battle" className="district-topbar-nav__link">대결 ⚔️</Link>
          <Link to="/ranking" className="district-topbar-nav__link">랭킹</Link>
          <Link to="/hot" className="district-topbar-nav__link">HOT 🔥</Link>
        </nav>
        <button type="button" className="district-location-button" onClick={() => void handleUseCurrentLocation()}>
          내 위치
        </button>
      </header>

      <section className="district-home-layout">
        <DistrictMap
          currentLocation={currentLocation}
          currentLocationRequest={locationRequestId}
          onViewportChange={handleViewportChange}
          onDistrictsChange={setDistricts}
          onSelectDistrict={(district) => {
            setSelectedApt(null);
            setSelectedDistrictId(district.code);
          }}
          selectedDistrictId={selectedDistrictId}
          onSelectApt={(apt) => {
            setSelectedDistrictId(null);
            setSelectedApt(apt);
          }}
          selectedAptId={selectedApt?.id ?? null}
        />
        {selectedApt ? (
          <AptPanel apt={selectedApt} />
        ) : (
          <DistrictPanel district={selectedDistrict} />
        )}
      </section>

      {locationError ? <p className="district-home-notice">{locationError}</p> : null}
    </main>
  );
}
