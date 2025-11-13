import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { format, addDays, differenceInDays } from 'date-fns';
import { GanttBar } from './GanttBar';
import { useGanttResize } from '@/hooks/useGanttResize';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  onReorderTasks: (taskId: number, newIndex: number) => void;
}

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  ganttStartDate,
  ganttEndDate,
  onDateChange,
  onEditTask,
  onToggleVisibility,
  onDeleteTask,
  onReorderTasks
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [tempDates, setTempDates] = useState<{ taskId: number; startDate: string; endDate: string } | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
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

  const handleDragStart = (taskId: number) => {
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    if (draggedTaskId !== null && dragOverIndex !== null) {
      onReorderTasks(draggedTaskId, dragOverIndex);
    }
    setDraggedTaskId(null);
    setDragOverIndex(null);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: -400,
        behavior: 'smooth'
      });
    }
  };

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({
        left: 400,
        behavior: 'smooth'
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            GANTT Operativo - Timeline Remediation
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={handleScrollLeft}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleScrollRight}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto" ref={scrollContainerRef}>
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
            {tasks.map((task, index) => {
              const processedTask = getTaskWithUpdatedDates(task);
              const isDragging = draggedTaskId === task.id;
              const isDropTarget = dragOverIndex === index;
              
              return (
                <div
                  key={task.id}
                  className={cn(
                    "relative transition-all",
                    isDropTarget && "border-t-2 border-primary"
                  )}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                >
                  <GanttBar
                    task={processedTask}
                    isBeingDragged={resizingTask?.id === task.id}
                    isDraggingVertically={isDragging}
                    onResizeStart={(e, side) => startResize(e, task.id, side, task.startDate, task.endDate)}
                    onEdit={() => onEditTask(processedTask)}
                    onToggleVisibility={() => onToggleVisibility(task.id)}
                    onDelete={() => onDeleteTask(task.id)}
                    onDragStart={() => handleDragStart(task.id)}
                    onDragEnd={handleDragEnd}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
