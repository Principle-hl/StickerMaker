interface SliderProps {
  label: string;
  /** Formatted value shown at the right of the label row. */
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  help?: string;
  onChange: (value: number) => void;
}

export default function Slider({ label, display, value, min, max, step, help, onChange }: SliderProps) {
  return (
    <div className="field">
      <label className="field-head">
        <span>{label}</span>
        <span className="readout">{display}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={e => onChange(+e.target.value)}
      />
      {help ? <p className="help">{help}</p> : null}
    </div>
  );
}
