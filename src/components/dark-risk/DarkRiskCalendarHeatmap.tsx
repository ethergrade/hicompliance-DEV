import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

interface Props {
  data: Record<string, number>;
  title?: string;
}

function intensityColor(count: number, max: number): string {
  if (!count || max === 0) return 'hsl(var(--muted))';
  const r = count / max;
  if (r > 0.75) return 'hsl(var(--destructive))';
  if (r > 0.5)  return '#f97316';
  if (r > 0.25) return '#eab308';
  return 'hsl(var(--primary) / 0.5)';
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS = ['S','M','T','W','T','F','S'];

export function DarkRiskCalendarHeatmap({ data, title = 'Results per Day' }: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string } | null>(null);

  const { weeks, monthMarkers, maxCount } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start from 52 weeks ago (Monday)
    const start = new Date(today);
    start.setDate(today.getDate() - 364);
    // Roll back to Monday
    const dow = start.getDay();
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));

    const allWeeks: Array<Array<{ date: string; count: number; isCurrentMonth: boolean }>> = [];
    const markers: Array<{ col: number; label: string }> = [];
    let currentMonth = -1;
    let col = 0;

    const cur = new Date(start);
    while (cur <= today) {
      const week: typeof allWeeks[0] = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = formatDate(cur);
        const count = data[dateStr] ?? 0;
        week.push({ date: dateStr, count, isCurrentMonth: cur <= today });
        cur.setDate(cur.getDate() + 1);
      }
      if (week[0]) {
        const monthOfFirstDay = new Date(week[0].date).getMonth();
        if (monthOfFirstDay !== currentMonth) {
          currentMonth = monthOfFirstDay;
          markers.push({ col, label: MONTH_NAMES[currentMonth] });
        }
      }
      allWeeks.push(week);
      col++;
    }

    const maxCount = Math.max(1, ...Object.values(data));

    return { weeks: allWeeks, monthMarkers: markers, maxCount };
  }, [data]);

  const totalResults = Object.values(data).reduce((s, v) => s + v, 0);

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {title}
          </div>
          {totalResults > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {totalResults.toLocaleString()} totale ultimi 12 mesi
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div style={{ minWidth: `${weeks.length * 14 + 24}px` }}>
            {/* Month labels */}
            <div style={{ display: 'flex', marginBottom: '4px', marginLeft: '24px' }}>
              {monthMarkers.map((m, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${m.col * 14 + 24}px`,
                    fontSize: '10px',
                    color: 'hsl(var(--muted-foreground))',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.label}
                </div>
              ))}
              <div style={{ height: '14px' }} />
            </div>

            {/* Grid */}
            <div style={{ display: 'flex', gap: '2px', marginLeft: '24px', position: 'relative', marginTop: '14px' }}>
              {/* Month label layer */}
              <div style={{ position: 'absolute', top: '-14px', left: 0, right: 0, height: '14px', pointerEvents: 'none' }}>
                {monthMarkers.map((m, i) => (
                  <span
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `${m.col * 14}px`,
                      fontSize: '10px',
                      color: 'hsl(var(--muted-foreground))',
                    }}
                  >
                    {m.label}
                  </span>
                ))}
              </div>

              {/* Day labels on left */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginRight: '4px', marginLeft: '-24px', width: '20px' }}>
                {DAY_LABELS.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      height: '12px',
                      fontSize: '9px',
                      color: 'hsl(var(--muted-foreground))',
                      lineHeight: '12px',
                      textAlign: 'right',
                      paddingRight: '2px',
                      visibility: i % 2 === 1 ? 'visible' : 'hidden',
                    }}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Weeks */}
              {weeks.map((week, wi) => (
                <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {week.map((day, di) => (
                    <div
                      key={di}
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '2px',
                        backgroundColor: day.isCurrentMonth
                          ? intensityColor(day.count, maxCount)
                          : 'hsl(var(--muted) / 0.3)',
                        cursor: day.count > 0 ? 'pointer' : 'default',
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        if (day.count > 0) {
                          setTooltip({
                            x: e.clientX,
                            y: e.clientY,
                            label: `${day.date}: ${day.count} result${day.count !== 1 ? 's' : ''}`,
                          });
                        }
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  ))}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', justifyContent: 'flex-end', fontSize: '10px', color: 'hsl(var(--muted-foreground))' }}>
              <span>Less</span>
              {[0, 0.1, 0.3, 0.6, 1.0].map((v, i) => (
                <div
                  key={i}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '2px',
                    backgroundColor: v === 0 ? 'hsl(var(--muted))' : intensityColor(v * maxCount, maxCount),
                  }}
                />
              ))}
              <span>More</span>
            </div>
          </div>
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            style={{
              position: 'fixed',
              left: tooltip.x + 8,
              top: tooltip.y - 28,
              background: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '11px',
              color: 'hsl(var(--popover-foreground))',
              zIndex: 9999,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {tooltip.label}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
