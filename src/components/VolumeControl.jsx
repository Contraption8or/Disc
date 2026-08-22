import Icon from "./Icon.jsx";
import "./VolumeControl.css";

export default function VolumeControl({ volume, onChange }) {
  const iconName = volume === 0 ? "volumeMute" : volume < 0.5 ? "volumeLow" : "volumeHigh";

  return (
    <div className="volume-control" title="Volume">
      <span className="volume-control__icon">
        <Icon name={iconName} size={15} />
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(e) => onChange(Number(e.target.value))}
        className="volume-control__slider"
      />
    </div>
  );
}
