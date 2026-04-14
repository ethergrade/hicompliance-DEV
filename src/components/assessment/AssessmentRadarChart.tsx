import React, { useMemo } from 'react';

import { cn } from '@/lib/utils';

type AssessmentRadarDatum = {
  category: string;
  fullName: string;
  compliance: number;
  target: number;
};

interface AssessmentRadarChartProps {
  data: AssessmentRadarDatum[];
  className?: string;
}

const VIEWBOX_WIDTH = 520;
const VIEWBOX_HEIGHT = 420;
const CENTER_X = 260;
const CENTER_Y = 188;
const RADIUS = 126;
const LABEL_RADIUS = 162;
const GRID_LEVELS = [25, 50, 75, 100];

const clampScore = (value: number) => Math.max(0, Math.min(100, value));

const polarToCartesian = (angle: number, value: number, radius = RADIUS) => {
  const scaledRadius = (clampScore(value) / 100) * radius;

  return {
    x: CENTER_X + Math.cos(angle) * scaledRadius,
    y: CENTER_Y + Math.sin(angle) * scaledRadius,
  };
};

const getTextAnchor = (x: number) => {
  if (x < CENTER_X - 18) return 'end';
  if (x > CENTER_X + 18) return 'start';
  return 'middle';
};

const getLabelY = (y: number) => {
  if (y < CENTER_Y - 90) return y - 6;
  if (y > CENTER_Y + 90) return y + 14;
  return y + 4;
};

export function AssessmentRadarChart({ data, className }: AssessmentRadarChartProps) {
  const geometry = useMemo(() => {
    if (!data.length) return null;

    const angleStep = (Math.PI * 2) / data.length;
    const startAngle = -Math.PI / 2;

    const axes = data.map((item, index) => {
      const angle = startAngle + index * angleStep;
      const axisPoint = polarToCartesian(angle, 100);
      const labelPoint = polarToCartesian(angle, 100, LABEL_RADIUS);

      return {
        ...item,
        angle,
        axisPoint,
        labelPoint,
        compliancePoint: polarToCartesian(angle, item.compliance),
        targetPoint: polarToCartesian(angle, item.target),
      };
    });

    const compliancePolygon = axes.map((axis) => `${axis.compliancePoint.x},${axis.compliancePoint.y}`).join(' ');
    const targetPolygon = axes.map((axis) => `${axis.targetPoint.x},${axis.targetPoint.y}`).join(' ');
    const gridPolygons = GRID_LEVELS.map((level) => ({
      level,
      points: axes.map((axis) => {
        const point = polarToCartesian(axis.angle, level);
        return `${point.x},${point.y}`;
      }).join(' '),
    }));

    return { axes, compliancePolygon, targetPolygon, gridPolygons };
  }, [data]);

  if (!geometry) return null;

  return (
    <div className={cn('h-[400px] w-full', className)}>
      <svg
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        className="h-full w-full"
        role="img"
        aria-label="Radar chart di allineamento NIS2, NIST e ISO"
      >
        <title>Radar chart di allineamento NIS2, NIST e ISO</title>

        {geometry.gridPolygons.map(({ level, points }) => (
          <polygon
            key={level}
            points={points}
            fill="none"
            stroke="hsl(var(--border))"
            strokeOpacity="0.65"
            strokeWidth="1"
          />
        ))}

        {geometry.axes.map((axis) => (
          <line
            key={axis.fullName}
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={axis.axisPoint.x}
            y2={axis.axisPoint.y}
            stroke="hsl(var(--border))"
            strokeOpacity="0.6"
            strokeWidth="1"
          />
        ))}

        <polygon
          points={geometry.targetPolygon}
          fill="none"
          stroke="hsl(var(--cyber-green))"
          strokeWidth="2"
          strokeDasharray="7 7"
          strokeOpacity="0.9"
        >
          <title>Target 90/100 su tutte le categorie</title>
        </polygon>

        <polygon
          points={geometry.compliancePolygon}
          fill="hsl(var(--primary))"
          fillOpacity="0.24"
          stroke="hsl(var(--primary))"
          strokeWidth="2.5"
          strokeLinejoin="round"
        >
          <title>Conformità reale calcolata dalle risposte assessment</title>
        </polygon>

        {geometry.axes.map((axis) => (
          <circle
            key={`${axis.fullName}-point`}
            cx={axis.compliancePoint.x}
            cy={axis.compliancePoint.y}
            r="3.5"
            fill="hsl(var(--primary))"
            stroke="hsl(var(--background))"
            strokeWidth="1.5"
          >
            <title>{`${axis.fullName}: ${Math.round(axis.compliance)}/100`}</title>
          </circle>
        ))}

        {GRID_LEVELS.map((level) => {
          const y = CENTER_Y - (level / 100) * RADIUS;

          return (
            <text
              key={`tick-${level}`}
              x={CENTER_X}
              y={y - 4}
              textAnchor="middle"
              fontSize="10"
              fill="hsl(var(--muted-foreground))"
            >
              {level}
            </text>
          );
        })}

        <text
          x={CENTER_X}
          y={CENTER_Y + 4}
          textAnchor="middle"
          fontSize="10"
          fill="hsl(var(--muted-foreground))"
        >
          0
        </text>

        {geometry.axes.map((axis) => (
          <text
            key={`${axis.fullName}-label`}
            x={axis.labelPoint.x}
            y={getLabelY(axis.labelPoint.y)}
            textAnchor={getTextAnchor(axis.labelPoint.x)}
            fontSize="11"
            fill="hsl(var(--muted-foreground))"
          >
            <title>{axis.fullName}</title>
            {axis.category}
          </text>
        ))}

        <g transform="translate(178, 390)">
          <rect width="18" height="10" rx="2" fill="hsl(var(--primary))" />
          <text x="24" y="9" fontSize="12" fill="hsl(var(--muted-foreground))">Conformità</text>

          <rect x="110" width="18" height="10" rx="2" fill="hsl(var(--cyber-green))" />
          <text x="134" y="9" fontSize="12" fill="hsl(var(--muted-foreground))">Target</text>
        </g>
      </svg>
    </div>
  );
}

export type { AssessmentRadarDatum };