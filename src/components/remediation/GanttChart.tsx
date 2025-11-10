import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { format, addDays, differenceInDays } from 'date-fns';
import { GanttBar } from './GanttBar';
import { useGanttResize } from '@/hooks/useGanttResize';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Calendar } from 'lucide-react';

interface GanttTask {
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
}

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  ganttStartDate,
  ganttEndDate,
  onDateChange,
  onEditTask,
  onToggleVisibility,
  onDeleteTask
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tempDates, setTempDates] = useState<{ taskId: number; startDate: string; endDate: string } | null>(null);
  
  const { resizingTask, startResize, handleMouseMove, stopResize } = useGanttResize({
    onDateChange,
    ganttStartDate,
    ganttEndDate
  });

  // Memoized weeks generation
  const weeks = useMemo(() => {
    const result = [];
    let currentDate = ganttStartDate;
    
    while (currentDate < ganttEndDate) {
      result.push({
        label: format(currentDate, 'dd/MM'),
        date: new Date(currentDate)
      });
      currentDate = addDays(currentDate, 7);
    }
    return result;
  }, [ganttStartDate, ganttEndDate]);

  // Throttled mouse move handler
  useEffect(() => {
    if (!resizingTask) return;

    let rafId: number | null = null;
    
    const handleMove = (e: MouseEvent) => {
      if (rafId) return; // Skip if already processing
      
      rafId = requestAnimationFrame(() => {
        if (!containerRef.current) {
          rafId = null;
          return;
        }
        
        const containerWidth = containerRef.current.offsetWidth;
        const newDates = handleMouseMove(e, containerWidth);
        
        if (newDates) {
          setTempDates(newDates);
        }
        rafId = null;
      });
    };

    const handleUp = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      stopResize(tempDates);
      setTempDates(null);
    };

    document.addEventListener('mousemove', handleMove, { passive: true });
    document.addEventListener('mouseup', handleUp);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [resizingTask, handleMouseMove, stopResize, tempDates]);

  // Optimized task date calculation
  const getTaskWithUpdatedDates = useCallback((task: GanttTask) => {
    const dates = tempDates?.taskId === task.id ? tempDates : { startDate: task.startDate, endDate: task.endDate };
    const totalDays = differenceInDays(ganttEndDate, ganttStartDate);
    const taskStart = new Date(dates.startDate);
    const taskEnd = new Date(dates.endDate);
    const daysFromStart = differenceInDays(taskStart, ganttStartDate);
    const duration = differenceInDays(taskEnd, taskStart);

    return {
      ...task,
      startDate: dates.startDate,
      endDate: dates.endDate,
      startOffset: (daysFromStart / totalDays) * 100,
      width: (duration / totalDays) * 100,
      duration
    };
  }, [tempDates, ganttStartDate, ganttEndDate]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          GANTT Operativo - Timeline Remediation
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          {/* Header with weeks */}
          <div className="flex items-center border-b border-border bg-muted/50 sticky top-0 z-10">
            <div className="w-80 px-4 py-2.5 font-medium text-sm shrink-0 bg-muted/50">
              Attività
            </div>
            <div className="flex-1 flex min-w-0" ref={containerRef}>
              {weeks.map((week, index) => (
                <div
                  key={index}
                  className="flex-1 px-1 py-2.5 text-xs text-center text-muted-foreground border-l border-border/50"
                >
                  {week.label}
                </div>
              ))}
            </div>
          </div>

          {/* Task Bars */}
          <div>
            {tasks.map((task) => {
              const updatedTask = getTaskWithUpdatedDates(task);
              
              return (
                <GanttBar
                  key={task.id}
                  task={updatedTask}
                  isBeingDragged={resizingTask?.id === task.id}
                  onResizeStart={(e, side) => startResize(e, task.id, side, task.startDate, task.endDate)}
                  onEdit={() => onEditTask(task)}
                  onToggleVisibility={() => onToggleVisibility(task.id)}
                  onDelete={() => onDeleteTask(task.id)}
                />
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
