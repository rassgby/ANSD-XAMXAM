/**
 * Linear, geometric, 1.5px-stroke pictograms — per the brief: functional only,
 * no color fills, no "AI" iconography. Extracted verbatim from the design
 * canvas so stroke paths stay pixel-identical to the approved mockup.
 */
type IconProps = {
  size?: number;
  stroke?: string;
  className?: string;
};

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 16 16",
  fill: "none",
  strokeWidth: 1.5,
});

export function GlobeIcon({ size = 16, stroke = "#5A6670", className }: IconProps) {
  return (
    <svg {...base(size)} stroke={stroke} className={className}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M1.75 8h12.5M8 1.75c1.6 1.7 2.4 3.8 2.4 6.25S9.6 12.55 8 14.25c-1.6-1.7-2.4-3.8-2.4-6.25S6.4 3.45 8 1.75Z" />
    </svg>
  );
}

export function MicIcon({ size = 18, stroke = "#1B1F23", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" strokeWidth={1.5} stroke={stroke} className={className}>
      <path d="M9 2.25a2.25 2.25 0 0 1 2.25 2.25v4.5a2.25 2.25 0 0 1-4.5 0V4.5A2.25 2.25 0 0 1 9 2.25Z" />
      <path d="M4.5 8.25v.75a4.5 4.5 0 0 0 9 0v-.75M9 13.5v2.25" />
    </svg>
  );
}

export function SendArrowIcon({ size = 16, stroke = "#FFFFFF", className }: IconProps) {
  return (
    <svg {...base(size)} stroke={stroke} className={className}>
      <path d="M2.5 8h11M9.5 4l4 4-4 4" />
    </svg>
  );
}

export function CheckIcon({ size = 14, stroke = "#0B6E4F", className }: IconProps) {
  return (
    <svg {...base(size)} stroke={stroke} className={className}>
      <path d="M3 8.5 6.25 11.75 13 5" />
    </svg>
  );
}

export function TrendIcon({ size = 15, stroke = "#1B1F23", className }: IconProps) {
  return (
    <svg {...base(size)} stroke={stroke} className={className}>
      <path d="M2.5 13.5V3M2.5 13.5H14" />
      <path d="M5 11V7.5M8 11V5M11 11V9" />
    </svg>
  );
}

export function CopyIcon({ size = 15, stroke = "#1B1F23", className }: IconProps) {
  return (
    <svg {...base(size)} stroke={stroke} className={className}>
      <path d="M5.5 2.5h5.5l2.5 2.5v8.5h-8z" />
      <path d="M2.5 5.5v8h3" />
    </svg>
  );
}

export function InfoIcon({ size = 15, stroke = "#1B1F23", className }: IconProps) {
  return (
    <svg {...base(size)} stroke={stroke} className={className}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5.25v.01M8 7.5v3.25" />
    </svg>
  );
}

export function TableIcon({ size = 15, stroke = "#1B1F23", className }: IconProps) {
  return (
    <svg {...base(size)} stroke={stroke} className={className}>
      <rect x="2.5" y="3" width="11" height="10" />
      <path d="M2.5 6.25h11M6.5 6.25V13" />
    </svg>
  );
}

export function ScopeDocIcon({ size = 15, stroke = "#5A6670", className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" strokeWidth={1.5} stroke={stroke} className={className}>
      <path d="M3 2.25h7l3 3v8.5H3z" />
      <path d="M5.5 7.5h5M5.5 10.25h5" />
    </svg>
  );
}

export function CloseIcon({ size = 16, stroke = "#5A6670", className }: IconProps) {
  return (
    <svg {...base(size)} stroke={stroke} className={className}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function PublicationIcon({ size = 15, stroke = "#FFFFFF", className }: IconProps) {
  return (
    <svg {...base(size)} stroke={stroke} className={className}>
      <path d="M3 2.5h7l3 3v8h-10z" />
      <path d="M5.5 8h5M5.5 10.5h5" />
    </svg>
  );
}

export function PauseBarsIcon({ size = 14, stroke = "#1B1F23", className }: IconProps) {
  return (
    <svg {...base(size)} stroke={stroke} className={className}>
      <path d="M5.5 4v8M10.5 4v8" />
    </svg>
  );
}

export function PlayIcon({ size = 14, stroke = "#1B1F23", className }: IconProps) {
  return (
    <svg {...base(size)} stroke={stroke} strokeLinejoin="round" className={className}>
      <path d="M5 3.5 12.5 8 5 12.5V3.5Z" />
    </svg>
  );
}
