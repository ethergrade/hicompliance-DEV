import React, { useRef, useState, useMemo, useCallback } from 'react';
import { format, addDays, differenceInDays, parseISO, addMonths, startOfMonth } from 'date-fns';
import { it } from 'date-fns/locale';
import { useGanttDrag } from '@/hooks/useGanttResize';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar, ChevronLeft, ChevronRight, Settings, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GanttTask {
  id: number;
  task: string;
  category: string;
  startDate: string;
  endDate: string;
  progress: number;
  priority: string;
  color: string;
  assignee: string;
  isHidden?: boolean;
  startOffset: number;
  width: number;
  duration: number;
}

interface GanttChartProps {
  tasks: GanttTask[];
  ganttStartDate: Date;
  ganttEndDate: Date;
  onDateChange: (taskId: number, startDate: string, endDate: string) => void;
  onEditTask: (task: GanttTask) => void;
  onToggleVisibility: (taskId: number) => void;
  onDeleteTask: (taskId: number) => void;
  onReorderTasks: (taskId: number, newIndex: number) => void;
}

/* ─── helpers ─── */
const MONTHS_IT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

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
  onReorderTasks,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  /* live dates while dragging */
  const [liveDates, setLiveDates] = useState<Record<number, { s: string; e: string }>>({});
  const [activeDragId, setActiveDragId] = useState<number | null>(null);

  const getTimelineWidth = useCallback(() => timelineRef.current?.offsetWidth ?? 1, []);

  const { onPointerDown, onPointerMove, onPointerUp } = useGanttDrag({
    onDateChange,
    ganttStartDate,
    ganttEndDate,
    getTimelineWidth,
  });

  /* months header */
  const months = useMemo(() => {
    const result: { label: string; weeks: number }[] = [];
    let cur = startOfMonth(ganttStartDate);
    while (cur < ganttEndDate) {
      const next = addMonths(cur, 1);
      const end = next > ganttEndDate ? ganttEndDate : next;
      const days = differenceInDays(end, cur < ganttStartDate ? ganttStartDate : cur);
      result.push({ label: MONTHS_IT[cur.getMonth()], weeks: Math.max(1, Math.round(days / 7)) });
      cur = next;
    }
    return result;
  }, [ganttStartDate, ganttEndDate]);

  const totalDays = differenceInDays(ganttEndDate, ganttStartDate);

  const getBarStyle = useCallback(
    (task: GanttTask) => {
      const live = liveDates[task.id];
      const sd = live ? live.s : task.startDate;
      const ed = live ? live.e : task.endDate;
      const daysFromStart = differenceInDays(parseISO(sd), ganttStartDate);
      const duration = differenceInDays(parseISO(ed), parseISO(sd));
      return {
        left: `${(daysFromStart / totalDays) * 100}%`,
        width: `${(duration / totalDays) * 100}%`,
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

  /* today marker */
  const todayOffset = useMemo(() => {
    const d = differenceInDays(new Date(), ganttStartDate);
    if (d < 0 || d > totalDays) return null;
    return (d / totalDays) * 100;
  }, [ganttStartDate, totalDays]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="w-5 h-5" />
            GANTT Operativo — Timeline {ganttStartDate.getFullYear()}
          </CardTitle>
          <div className="flex items-center gap-1">
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
        <div
          className="overflow-x-auto select-none"
          ref={scrollRef}
          onPointerMove={onPointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Month header */}
          <div className="flex border-b border-border bg-muted/50 sticky top-0 z-10">
            <div className="w-64 shrink-0 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Attività
            </div>
            <div className="flex flex-1 min-w-[900px]" ref={timelineRef}>
              {months.map((m, i) => (
                <div
                  key={i}
                  className="border-l border-border/40 text-center text-[11px] font-medium text-muted-foreground py-2"
                  style={{ flex: m.weeks }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="relative">
            {tasks.map((task, _idx) => {
              const bar = getBarStyle(task);
              const isDragging = activeDragId === task.id;

              return (
                <div
                  key={task.id}
                  className={cn(
                    'flex items-center h-11 border-b border-border/30 group hover:bg-muted/20 transition-colors',
                    isDragging && 'bg-muted/30',
                  )}
                >
                  {/* Left label */}
                  <div className={cn('w-64 shrink-0 px-3 flex items-center gap-2 border-l-2', priorityBorder[task.priority] || 'border-l-border')}>
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate leading-tight">{task.task}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{task.assignee}</p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-1 rounded hover:bg-muted"
                        onClick={() => onEditTask(task)}
                      >
                        <Settings className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-destructive/10"
                        onClick={() => onDeleteTask(task.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive/70" />
                      </button>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="flex-1 relative h-full min-w-[900px]">
                    {/* Today line */}
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
                              'absolute h-6 rounded-md cursor-grab active:cursor-grabbing touch-none',
                              isDragging
                                ? 'ring-2 ring-primary/50 shadow-lg z-20'
                                : 'hover:brightness-110 hover:shadow-md transition-shadow',
                            )}
                            style={{
                              left: bar.left,
                              width: bar.width,
                              backgroundColor: task.color || 'hsl(var(--primary))',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              minWidth: 24,
                            }}
                            onPointerDown={(e) => handleBarPointerDown(e, task, 'middle')}
                          >
                            {/* Progress overlay */}
                            {task.progress > 0 && (
                              <div
                                className="absolute inset-y-0 left-0 bg-white/25 rounded-l-md pointer-events-none"
                                style={{ width: `${task.progress}%` }}
                              />
                            )}

                            {/* Resize handles */}
                            <div
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l-md hover:bg-white/40 active:bg-white/50"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                handleBarPointerDown(e, task, 'left');
                              }}
                            />
                            <div
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r-md hover:bg-white/40 active:bg-white/50"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                handleBarPointerDown(e, task, 'right');
                              }}
                            />

                            {/* Bar label */}
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
        </div>
      </CardContent>
    </Card>
  );
};
