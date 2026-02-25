/**
 * SignalRadar — reusable SVG spider chart for a single metric across sections.
 * Used three times in the Learning tab: Strengths, Surprises, Gaps.
 * Labels are section numbers; a shared legend maps numbers to titles.
 */

interface RadarAxis {
  label: string;
  value: number;
}

interface Props {
  axes: RadarAxis[];
  title: string;
  color: { fill: string; stroke: string; dot: string };
  maxValue?: number;
}

const SIZE = 200;
const CENTER = SIZE / 2;
const MAX_RADIUS = 70;
const RINGS = 3;
const LABEL_OFFSET = 14;

function polarToXY(angle: number, radius: number): [number, number] {
  return [
    CENTER + radius * Math.cos(angle - Math.PI / 2),
    CENTER + radius * Math.sin(angle - Math.PI / 2),
  ];
}

export const RADAR_COLORS = {
  strengths: { fill: "rgba(34, 197, 94, 0.25)", stroke: "rgba(34, 197, 94, 0.8)", dot: "rgb(34, 197, 94)" },
  surprises: { fill: "rgba(245, 158, 11, 0.25)", stroke: "rgba(245, 158, 11, 0.8)", dot: "rgb(245, 158, 11)" },
  gaps: { fill: "rgba(239, 68, 68, 0.2)", stroke: "rgba(239, 68, 68, 0.7)", dot: "rgb(239, 68, 68)" },
};

export function SignalRadar({ axes, title, color, maxValue }: Props) {
  const n = axes.length;
  if (n === 0) return null;

  const angleStep = (2 * Math.PI) / n;
  const max = maxValue ?? Math.max(...axes.map((a) => a.value), 1);
  const hasData = axes.some((a) => a.value > 0);

  // Build polygon
  const points = axes.map((a, i) => {
    const angle = i * angleStep;
    const r = (a.value / max) * MAX_RADIUS;
    return polarToXY(angle, Math.max(r, 0));
  });

  const polygonPath = hasData
    ? points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") + " Z"
    : null;

  return (
    <div className="flex flex-col items-center">
      <div className="text-[11px] font-medium text-gray-600 mb-0.5">{title}</div>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[200px]">
        {/* Ring guides */}
        {Array.from({ length: RINGS }, (_, i) => {
          const r = ((i + 1) / RINGS) * MAX_RADIUS;
          const ringPath = Array.from({ length: n }, (_, j) => {
            const [x, y] = polarToXY(j * angleStep, r);
            return `${j === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          }).join(" ") + " Z";
          return (
            <path key={i} d={ringPath} fill="none" stroke="rgba(209, 213, 219, 0.5)" strokeWidth="0.5" />
          );
        })}

        {/* Axis lines */}
        {axes.map((_, i) => {
          const [x, y] = polarToXY(i * angleStep, MAX_RADIUS);
          return (
            <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="rgba(209, 213, 219, 0.4)" strokeWidth="0.5" />
          );
        })}

        {/* Data polygon */}
        {polygonPath && (
          <path d={polygonPath} fill={color.fill} stroke={color.stroke} strokeWidth="1.5" />
        )}

        {/* Data points with values */}
        {axes.map((a, i) => {
          if (a.value === 0) return null;
          const angle = i * angleStep;
          const r = (a.value / max) * MAX_RADIUS;
          const [x, y] = polarToXY(angle, r);
          return (
            <g key={`p-${i}`}>
              <circle cx={x} cy={y} r={3.5} fill={color.dot} opacity={0.8} />
              <text x={x} y={y - 6} textAnchor="middle" fontSize="8" fontWeight="bold" fill={color.dot}>
                {a.value}
              </text>
            </g>
          );
        })}

        {/* Axis labels — section numbers only */}
        {axes.map((a, i) => {
          const angle = i * angleStep;
          const [x, y] = polarToXY(angle, MAX_RADIUS + LABEL_OFFSET);
          return (
            <text
              key={`l-${i}`}
              x={x} y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="9"
              fontWeight={a.value > 0 ? "bold" : "normal"}
              fill={a.value > 0 ? color.dot : "rgb(180, 180, 180)"}
            >
              {i + 1}
            </text>
          );
        })}

        {/* Empty state */}
        {!hasData && (
          <text x={CENTER} y={CENTER} textAnchor="middle" dominantBaseline="middle" fontSize="10" fill="rgb(156, 163, 175)">
            None yet
          </text>
        )}
      </svg>
    </div>
  );
}

/** Shared legend mapping section numbers to titles — rendered once below all three radars */
export function RadarLegend({ sections }: { sections: Array<{ position: number; title: string }> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 justify-center text-[9px] text-gray-500">
      {sections.map((s) => (
        <span key={s.position}>
          <span className="font-medium text-gray-600">{s.position}</span>{" "}
          {s.title}
        </span>
      ))}
    </div>
  );
}
