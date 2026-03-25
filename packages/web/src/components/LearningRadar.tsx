/**
 * LearningRadar — pure SVG radar chart showing learning depth across sections.
 * Axes = sections, polygon fill = depth level, markers = discoveries & gaps.
 */

interface RadarSection {
  label: string;
  depth: number;       // 0-3 (UNKNOWN=0, SURFACE=1, MODERATE=2, DEEP=3)
  discoveries: number; // count of surprises
  gaps: number;        // count of self-identified unknowns
}

interface Props {
  sections: RadarSection[];
}

const SIZE = 400;
const CENTER = SIZE / 2;
const MAX_RADIUS = 140;
const RINGS = 3; // SURFACE, MODERATE, DEEP
const LABEL_OFFSET = 24;

// Depth → color (for polygon fill)
function depthColor(depth: number): string {
  if (depth >= 3) return "rgba(34, 197, 94, 0.35)";  // green — deep
  if (depth >= 2) return "rgba(234, 179, 8, 0.3)";   // yellow — moderate
  if (depth >= 1) return "rgba(239, 68, 68, 0.25)";  // red — surface
  return "rgba(156, 163, 175, 0.15)";                 // gray — unknown
}

function depthStroke(depth: number): string {
  if (depth >= 3) return "rgba(34, 197, 94, 0.8)";
  if (depth >= 2) return "rgba(234, 179, 8, 0.7)";
  if (depth >= 1) return "rgba(239, 68, 68, 0.6)";
  return "rgba(156, 163, 175, 0.4)";
}

/** Get (x, y) for a point at given angle and radius from center */
function polarToXY(angle: number, radius: number): [number, number] {
  return [
    CENTER + radius * Math.cos(angle - Math.PI / 2),
    CENTER + radius * Math.sin(angle - Math.PI / 2),
  ];
}

/** Truncate label to fit */
function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return label.slice(0, maxLen - 1) + "\u2026";
}

export function LearningRadar({ sections }: Props) {
  const n = sections.length;
  if (n === 0) return null;

  const angleStep = (2 * Math.PI) / n;

  // Build depth polygon points
  const depthPoints = sections.map((s, i) => {
    const angle = i * angleStep;
    const r = (s.depth / RINGS) * MAX_RADIUS;
    return polarToXY(angle, Math.max(r, 8)); // minimum radius so unknown isn't invisible
  });

  const polygonPath = depthPoints.map(([x, y], i) =>
    `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`
  ).join(" ") + " Z";

  // Average depth for polygon fill color
  const avgDepth = sections.reduce((sum, s) => sum + s.depth, 0) / n;

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[400px] mx-auto">
      {/* Concentric ring guides */}
      {Array.from({ length: RINGS }, (_, i) => {
        const r = ((i + 1) / RINGS) * MAX_RADIUS;
        const ringPoints = Array.from({ length: n }, (_, j) => {
          const [x, y] = polarToXY(j * angleStep, r);
          return `${j === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ") + " Z";
        return (
          <path
            key={i}
            d={ringPoints}
            fill="none"
            stroke="rgba(209, 213, 219, 0.5)"
            strokeWidth="0.5"
          />
        );
      })}

      {/* Ring labels */}
      {["Surface", "Moderate", "Deep"].map((label, i) => {
        const r = ((i + 1) / RINGS) * MAX_RADIUS;
        return (
          <text
            key={label}
            x={CENTER + 4}
            y={CENTER - r + 4}
            fontSize="9"
            fill="rgba(156, 163, 175, 0.7)"
          >
            {label}
          </text>
        );
      })}

      {/* Axis lines */}
      {sections.map((_, i) => {
        const [x, y] = polarToXY(i * angleStep, MAX_RADIUS);
        return (
          <line
            key={i}
            x1={CENTER} y1={CENTER}
            x2={x} y2={y}
            stroke="rgba(209, 213, 219, 0.4)"
            strokeWidth="0.5"
          />
        );
      })}

      {/* Depth polygon */}
      <path
        d={polygonPath}
        fill={depthColor(avgDepth)}
        stroke={depthStroke(avgDepth)}
        strokeWidth="1.5"
      />

      {/* Discovery markers (amber dots) */}
      {sections.map((s, i) => {
        if (s.discoveries === 0) return null;
        const angle = i * angleStep;
        const r = Math.max((s.depth / RINGS) * MAX_RADIUS, 8);
        const [x, y] = polarToXY(angle, r);
        const size = Math.min(4 + s.discoveries * 1.5, 10);
        return (
          <g key={`d-${i}`}>
            <circle cx={x} cy={y} r={size} fill="rgba(245, 158, 11, 0.7)" stroke="rgb(245, 158, 11)" strokeWidth="1" />
            <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="bold" fill="white">
              {s.discoveries > 1 ? s.discoveries : "!"}
            </text>
          </g>
        );
      })}

      {/* Gap markers (red squares) */}
      {sections.map((s, i) => {
        if (s.gaps === 0) return null;
        const angle = i * angleStep;
        const r = Math.max((s.depth / RINGS) * MAX_RADIUS, 8) + 16;
        const [x, y] = polarToXY(angle, Math.min(r, MAX_RADIUS - 5));
        return (
          <rect
            key={`g-${i}`}
            x={x - 4} y={y - 4}
            width="8" height="8"
            fill="rgba(239, 68, 68, 0.6)"
            stroke="rgb(239, 68, 68)"
            strokeWidth="0.5"
            rx="1"
          />
        );
      })}

      {/* Axis labels */}
      {sections.map((s, i) => {
        const angle = i * angleStep;
        const [x, y] = polarToXY(angle, MAX_RADIUS + LABEL_OFFSET);

        // Determine text-anchor based on position
        const normalizedAngle = ((angle - Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI));
        let anchor: "start" | "middle" | "end" = "middle";
        if (normalizedAngle > 0.3 && normalizedAngle < Math.PI - 0.3) anchor = "start";
        else if (normalizedAngle > Math.PI + 0.3 && normalizedAngle < 2 * Math.PI - 0.3) anchor = "end";

        return (
          <text
            key={`l-${i}`}
            x={x} y={y}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize="11"
            fill="rgb(107, 114, 128)"
          >
            {truncateLabel(s.label, 22)}
          </text>
        );
      })}
    </svg>
  );
}
