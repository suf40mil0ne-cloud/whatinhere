interface Props {
  onClick: () => void;
  disabled?: boolean;
}

export function CurrentLocationButton({ onClick, disabled }: Props) {
  return (
    <button type="button" className="map-action-button" onClick={onClick} disabled={disabled}>
      내 위치로 이동
    </button>
  );
}
