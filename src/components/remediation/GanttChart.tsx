import React, { useRef, useEffect, useState } from 'react';
import { format, addDays, differenceInDays } from 'date-fns';
import { GanttBar } from './GanttBar';
import { useGanttResize } from '@/hooks/useGanttResize';
import { Card } from '@/components/ui/card';

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
  progressWidth: number;
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

  // Generate weeks for header
  const generateWeeks = () => {
    const weeks = [];
    let currentDate = ganttStartDate;
    
    while (currentDate < ganttEndDate) {
      weeks.push({
        label: format(currentDate, 'dd/MM'),
        date: new Date(currentDate)
      });
      currentDate = addDays(currentDate, 7);
    }
    return weeks;
  };

  const weeks = generateWeeks();

  useEffect(() => {
    if (!resizingTask) return;

    const handleMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      const containerWidth = containerRef.current.offsetWidth;
      const newDates = handleMouseMove(e, containerWidth);
      
      if (newDates) {
        setTempDates(newDates);
      }
    };

    const handleUp = () => {
      stopResize(tempDates);
      setTempDates(null);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [resizingTask, handleMouseMove, stopResize, tempDates]);

  // Apply temporary dates during drag
  const getTaskDates = (task: GanttTask) => {
    if (tempDates && tempDates.taskId === task.id) {
      return tempDates;
    }
    return { startDate: task.startDate, endDate: task.endDate };
  };

  // Recalculate positions for tasks with temporary dates
  const getTaskWithUpdatedDates = (task: GanttTask) => {
    const dates = getTaskDates(task);
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
  };

  return (
    <Card className="overflow-hidden">
      <div className="gantt-container">
        {/* Header with weeks */}
        <div className="flex items-center border-b border-border bg-muted/50">
          <div className="w-64 px-4 py-2 font-medium text-sm">
            Attività
          </div>
          <div className="flex-1 flex" ref={containerRef}>
            {weeks.map((week, index) => (
              <div
                key={index}
                className="flex-1 px-2 py-2 text-xs text-center text-muted-foreground border-l border-border"
              >
                {week.label}
              </div>
            ))}
          </div>
        </div>

        {/* Task Bars */}
        <div className="gantt-timeline">
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
    </Card>
  );
};
