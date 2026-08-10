import { num, formatDay, type TimeseriesRow } from '@/lib/analytics';

/**
 * The daily trend chart.
 *
 * Hand-rolled SVG rather than a charting library: the repo has no chart
 * dependency, and adding one for a single view would cost more bundle than the
 * ~120 lines here. Drawn in a fixed 1000×320 viewBox and scaled by the browser,
 * so it stays sharp at any width without measuring the container.
 *
 * The y-axis starts at zero and is always shown. An axis that starts at the
 * minimum value makes a flat week look like a rally, which is exactly the kind
 * of flattering distortion this dashboard is meant to avoid.
 */

const W = 1000;
const H = 320;
const PAD = { top: 16, right: 16, bottom: 34, left: 46 };

interface Series {
  key: keyof Pick<TimeseriesRow, 'plays' | 'listeners' | 'saves' | 'comments' | 'signups'>;
  label: string;
  color: string;
  /** Filled area under the line. Only the primary series gets one. */
  fill?: boolean;
}

const SERIES: Series[] = [
  { key: 'plays', label: 'Plays', color: 'hsl(var(--primary))', fill: true },
  { key: 'listeners', label: 'Unique listeners', color: 'hsl(280 70% 60%)' },
  { key: 'saves', label: 'Saves', color: 'hsl(160 70% 40%)' },
  { key: 'comments', label: 'Comments', color: 'hsl(35 90% 50%)' },
];

/** Rounds a max up to something a human would choose for an axis top. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

export function TrendChart({ rows }: { rows: TimeseriesRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        No activity recorded in this period.
      </div>
    );
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const peak = Math.max(
    1,
    ...rows.flatMap((r) => SERIES.map((s) => num(r[s.key]))),
  );
  const top = niceMax(peak);

  // With a single day there is no span to divide by; pin it to the middle
  // rather than dividing by zero and producing NaN coordinates.
  const x = (i: number) => PAD.left + (rows.length === 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  // Enough labels to orient, few enough to stay legible at any width.
  const labelEvery = Math.max(1, Math.ceil(rows.length / 8));

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Daily activity from ${formatDay(rows[0].day)} to ${formatDay(rows[rows.length - 1].day)}`}
      >
        {/* Horizontal gridlines and y-axis labels */}
        {gridLines.map((g) => {
          const value = top * (1 - g);
          const yy = PAD.top + innerH * g;
          return (
            <g key={g}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={yy}
                y2={yy}
                stroke="hsl(var(--border))"
                strokeWidth={1}
                strokeDasharray={g === 1 ? undefined : '4 4'}
              />
              <text
                x={PAD.left - 8}
                y={yy + 4}
                textAnchor="end"
                fontSize={11}
                fill="hsl(var(--muted-foreground))"
              >
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        {/* x-axis labels */}
        {rows.map((r, i) =>
          i % labelEvery === 0 || i === rows.length - 1 ? (
            <text
              key={r.day}
              x={x(i)}
              y={H - PAD.bottom + 18}
              textAnchor="middle"
              fontSize={11}
              fill="hsl(var(--muted-foreground))"
            >
              {formatDay(r.day)}
            </text>
          ) : null,
        )}

        {SERIES.map((s) => {
          const points = rows.map((r, i) => `${x(i)},${y(num(r[s.key]))}`).join(' ');
          return (
            <g key={s.key}>
              {s.fill ? (
                <polygon
                  points={`${PAD.left},${PAD.top + innerH} ${points} ${x(rows.length - 1)},${PAD.top + innerH}`}
                  fill={s.color}
                  fillOpacity={0.1}
                />
              ) : null}
              <polyline
                points={points}
                fill="none"
                stroke={s.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Dots only when the series is sparse enough for them to read as
                  data points rather than as a thicker line. */}
              {rows.length <= 32
                ? rows.map((r, i) => (
                    <circle key={r.day} cx={x(i)} cy={y(num(r[s.key]))} r={3} fill={s.color} />
                  ))
                : null}
            </g>
          );
        })}

        {/* Invisible hit areas: a native tooltip per day, with no JS. */}
        {rows.map((r, i) => (
          <rect
            key={r.day}
            x={x(i) - innerW / rows.length / 2}
            y={PAD.top}
            width={innerW / rows.length}
            height={innerH}
            fill="transparent"
          >
            <title>
              {`${formatDay(r.day)} — ${num(r.plays)} plays, ${num(r.listeners)} listeners, ${num(r.saves)} saves, ${num(r.comments)} comments`}
            </title>
          </rect>
        ))}
      </svg>

      <figcaption className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-3 justify-center">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
