import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import { format, differenceInCalendarDays, parseISO, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { it } from 'date-fns/locale';
import { useGanttDrag } from '@/hooks/useGanttResize';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar, ChevronLeft, ChevronRight, Settings, Trash2, GripVertical, ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GanttTask {
  id: string;
  task: string;
  category: string;
  startDate: string;
  endDate: string;
  progress: number;
  priority: string;
  color: string;
  assignee: string;
  isHidden?: boolean;
  budget?: number;
  startOffset: number;
  width: number;
  duration: number;
}

interface GanttChartProps {
  tasks: GanttTask[];
  ganttStartDate: Date;
  ganttEndDate: Date;
  onDateChange: (taskId: string, startDate: string, endDate: string) => void;
  onEditTask: (task: GanttTask) => void;
  onToggleVisibility: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onReorderTasks: (taskId: string, newIndex: number) => void;
  onProgressChange?: (taskId: string, progress: number) => void;
  canEdit?: boolean;
  canUpdateProgress?: boolean;
}

const MONTHS_IT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const TIMELINE_MIN_WIDTH = 1100;
const ZOOM_LEVELS = [800, 1100, 1600, 2400, 3600];
const SIDEBAR_WIDTH_CLASS = 'w-72';

const priorityBorder: Record<string, string> = {
  Critica: 'border-l-red-500',
  Alta: 'border-l-orange-500',
  Media: 'border-l-yellow-500',
  Bassa: 'border-l-green-500',
};

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  ganttStartDate,
  ganttEndDate,
  onDateChange,
  onEditTask,
  onToggleVisibility: _onToggleVisibility,
  onDeleteTask,
  onReorderTasks: _onReorderTasks,
  onProgressChange,
  canEdit = true,
  canUpdateProgress = false,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [liveDates, setLiveDates] = useState<Record<string, { s: string; e: string }>>({});
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState(1);

  const getTimelineWidth = useCallback(() => timelineRef.current?.offsetWidth ?? 1, []);

  const { onPointerDown, onPointerMove, onPointerUp } = useGanttDrag({
    onDateChange,
    ganttStartDate,
    ganttEndDate,
    getTimelineWidth,
  });

  const months = useMemo(() => {
    const result: { label: string; days: number }[] = [];
    let cur = startOfMonth(ganttStartDate);
    while (cur <= ganttEndDate) {
      const next = addMonths(cur, 1);
      const monthStart = cur < ganttStartDate ? ganttStartDate : cur;
      const monthEnd = endOfMonth(cur) > ganttEndDate ? ganttEndDate : endOfMonth(cur);
      const days = Math.max(1, differenceInCalendarDays(monthEnd, monthStart) + 1);
      result.push({ label: MONTHS_IT[cur.getMonth()], days });
      cur = next;
    }
    return result;
  }, [ganttStartDate, ganttEndDate]);

  const totalDays = Math.max(1, differenceInCalendarDays(ganttEndDate, ganttStartDate) + 1);
  const visibleTasks = useMemo(() => tasks.filter((task) => !task.isHidden), [tasks]);
  const monthGridTemplate = useMemo(() => months.map((month) => `${month.days}fr`).join(' '), [months]);

  const getBarStyle = useCallback(
    (task: GanttTask) => {
      const live = liveDates[task.id];
      const rawStart = parseISO(live ? live.s : task.startDate);
      const rawEnd = parseISO(live ? live.e : task.endDate);
      const start = rawStart < ganttStartDate ? ganttStartDate : rawStart;
      const normalizedEnd = rawEnd < rawStart ? rawStart : rawEnd;
      const end = normalizedEnd > ganttEndDate ? ganttEndDate : normalizedEnd;
      const daysFromStart = Math.max(0, differenceInCalendarDays(start, ganttStartDate));
      const duration = Math.max(1, differenceInCalendarDays(normalizedEnd, rawStart) + 1);
      const visibleDuration = Math.max(1, differenceInCalendarDays(end, start) + 1);

      return {
        left: `${(daysFromStart / totalDays) * 100}%`,
        width: `${(visibleDuration / totalDays) * 100}%`,
        duration,
      };
    },
    [liveDates, ganttStartDate, totalDays],
  );

  const handleBarPointerDown = useCallback(
    (e: React.PointerEvent, task: GanttTask, side: 'left' | 'right' | 'middle') => {
      setActiveDragId(task.id);
      onPointerDown(e, task.id, side, task.startDate, task.endDate, (sd, ed) => {
        setLiveDates((prev) => ({ ...prev, [task.id]: { s: sd, e: ed } }));
      });
    },
    [onPointerDown],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      onPointerUp(e);
      if (activeDragId !== null) {
        const live = liveDates[activeDragId];
        if (live) {
          onDateChange(activeDragId, live.s, live.e);
        }
        setLiveDates((prev) => {
          const next = { ...prev };
          delete next[activeDragId];
          return next;
        });
        setActiveDragId(null);
      }
    },
    [onPointerUp, activeDragId, liveDates, onDateChange],
  );

  const scroll = (dir: number) => scrollRef.current?.scrollBy({ left: dir * 300, behavior: 'smooth' });
  const timelineMinWidth = ZOOM_LEVELS[zoomIndex];
  const canZoomOut = zoomIndex > 0;
  const canZoomIn = zoomIndex < ZOOM_LEVELS.length - 1;

  const todayOffset = useMemo(() => {
    const d = differenceInCalendarDays(new Date(), ganttStartDate);
    if (d < 0 || d > totalDays) return null;
    return (d / totalDays) * 100;
  }, [ganttStartDate, totalDays]);

  useEffect(() => {
    if (!activeDragId) return;

    const handleWindowPointerMove = (event: PointerEvent) => onPointerMove(event);
    const handleWindowPointerUp = () => {
      if (activeDragId !== null) {
        const live = liveDates[activeDragId];
        if (live) {
          onDateChange(activeDragId, live.s, live.e);
        }
        setLiveDates((prev) => {
          const next = { ...prev };
          delete next[activeDragId];
          return next;
        });
        setActiveDragId(null);
      }
      onPointerUp({} as React.PointerEvent);
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [activeDragId, liveDates, onDateChange, onPointerMove, onPointerUp]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-5 h-5" />
            GANTT Operativo — Timeline {ganttStartDate.getFullYear()}
          </CardTitle>
          <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => setZoomIndex(i => Math.max(0, i - 1))} disabled={!canZoomOut} className="h-7 w-7" title="Zoom out">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setZoomIndex(i => Math.min(ZOOM_LEVELS.length - 1, i + 1))} disabled={!canZoomIn} className="h-7 w-7" title="Zoom in">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <div className="w-px h-5 bg-border mx-1" />
              <Button variant="outline" size="icon" onClick={() => scroll(-1)} className="h-7 w-7">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => scroll(1)} className="h-7 w-7">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto select-none" ref={scrollRef} onPointerMove={onPointerMove} onPointerUp={handlePointerUp}>
          <div style={{ minWidth: `${timelineMinWidth}px` }}>
            <div className="grid grid-cols-[18rem_minmax(0,1fr)] border-b border-border bg-muted/50 sticky top-0 z-10">
              <div className={`${SIDEBAR_WIDTH_CLASS} shrink-0 sticky left-0 z-20 bg-card px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider`}>
                Attività
              </div>
              <div
                className="grid flex-1"
                ref={timelineRef}
                style={{ minWidth: `${timelineMinWidth}px`, gridTemplateColumns: monthGridTemplate }}
              >
                {months.map((m, i) => (
                  <div
                    key={`${m.label}-${i}`}
                    className="border-l border-border/40 text-center text-[11px] font-medium text-muted-foreground py-3"
                  >
                    {m.label}
                  </div>
                ))}
              </div>
            </div>

            {visibleTasks.length === 0 ? (
              <div className="px-4 py-12 text-sm text-muted-foreground">Nessuna attività disponibile nella timeline corrente.</div>
            ) : (
              <div>
                {visibleTasks.map((task) => {
                  const bar = getBarStyle(task);
                  const isDragging = activeDragId === task.id;

                  return (
                    <div
                      key={task.id}
                      className={cn(
                        'grid grid-cols-[18rem_minmax(0,1fr)] min-h-14 border-b border-border/30 group hover:bg-muted/20 transition-colors',
                        isDragging && 'bg-muted/30',
                      )}
                    >
                      <div className={cn(`${SIDEBAR_WIDTH_CLASS} shrink-0 sticky left-0 z-10 bg-background px-4 py-3 flex items-center gap-2 border-l-2`, priorityBorder[task.priority] || 'border-l-border')}>
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-xs font-medium line-clamp-2 leading-tight cursor-default">{task.task}</p>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p>{task.task}</p>
                            </TooltipContent>
                          </Tooltip>
                          <p className="text-[10px] text-muted-foreground truncate mt-1">{task.assignee}</p>
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button type="button" className="p-1 rounded hover:bg-muted" onClick={() => onEditTask(task)}>
                              <Settings className="h-3 w-3 text-muted-foreground" />
                            </button>
                            <button type="button" className="p-1 rounded hover:bg-destructive/10" onClick={() => onDeleteTask(task.id)}>
                              <Trash2 className="h-3 w-3 text-destructive/70" />
                            </button>
                          </div>
                        )}
                        {canUpdateProgress && !canEdit && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              defaultValue={task.progress}
                              className="w-12 h-6 text-xs rounded border border-border bg-background px-1 text-center"
                              onBlur={(e) => {
                                const val = Math.min(100, Math.max(0, Number(e.target.value)));
                                if (val !== task.progress) onProgressChange?.(task.id, val);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-[10px] text-muted-foreground">%</span>
                          </div>
                        )}
                      </div>

                      <div className="relative" style={{ minWidth: `${timelineMinWidth}px` }}>
                        <div
                          className="absolute inset-0 grid pointer-events-none"
                          style={{ gridTemplateColumns: monthGridTemplate }}
                        >
                          {months.map((m, i) => (
                            <div key={`grid-${m.label}-${i}`} className="border-l border-border/25" />
                          ))}
                        </div>

                        {todayOffset !== null && (
                          <div
                            className="absolute top-0 bottom-0 w-px bg-primary/40 z-10 pointer-events-none"
                            style={{ left: `${todayOffset}%` }}
                          />
                        )}

                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  'absolute top-1/2 -translate-y-1/2 h-7 rounded-full touch-none z-20',
                                  canEdit
                                    ? 'cursor-grab active:cursor-grabbing'
                                    : 'cursor-default',
                                  isDragging
                                    ? 'ring-2 ring-primary/50 shadow-lg'
                                    : 'hover:brightness-110 hover:shadow-md transition-shadow',
                                )}
                                style={{
                                  left: bar.left,
                                  width: bar.width,
                                  backgroundColor: task.color || 'hsl(var(--primary))',
                                  minWidth: 28,
                                }}
                                onPointerDown={canEdit ? (e) => handleBarPointerDown(e, task, 'middle') : undefined}
                              >
                                {task.progress > 0 && (
                                  <div
                                    className="absolute inset-y-0 left-0 bg-white/20 rounded-full pointer-events-none"
                                    style={{ width: `${task.progress}%` }}
                                  />
                                )}

                                <div
                                  className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize rounded-l-full hover:bg-white/30 active:bg-white/40"
                                  onPointerDown={canEdit ? (e) => {
                                    e.stopPropagation();
                                    handleBarPointerDown(e, task, 'left');
                                  } : undefined}
                                />
                                <div
                                  className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize rounded-r-full hover:bg-white/30 active:bg-white/40"
                                  onPointerDown={canEdit ? (e) => {
                                    e.stopPropagation();
                                    handleBarPointerDown(e, task, 'right');
                                  } : undefined}
                                />

                                <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] text-white font-semibold pointer-events-none select-none overflow-hidden">
                                  <span className="truncate">{bar.duration}g</span>
                                  {task.progress > 0 && <span>{task.progress}%</span>}
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-[220px]">
                              <p className="font-semibold">{task.task}</p>
                              <p className="text-muted-foreground">
                                {format(parseISO(liveDates[task.id]?.s || task.startDate), 'dd MMM', { locale: it })} →{' '}
                                {format(parseISO(liveDates[task.id]?.e || task.endDate), 'dd MMM yyyy', { locale: it })}
                              </p>
                              <p>Progresso: {task.progress}% · {task.priority}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
