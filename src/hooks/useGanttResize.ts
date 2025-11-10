import { useState, useCallback } from 'react';
import { format, addDays, differenceInDays, parseISO } from 'date-fns';

interface UseGanttResizeProps {
  onDateChange: (taskId: number, startDate: string, endDate: string) => void;
  ganttStartDate: Date;
  ganttEndDate: Date;
}

export const useGanttResize = ({ onDateChange, ganttStartDate, ganttEndDate }: UseGanttResizeProps) => {
  const [resizingTask, setResizingTask] = useState<{ id: number; side: 'left' | 'right' | 'middle'; initialX: number; initialStartDate: string; initialEndDate: string } | null>(null);

  const startResize = useCallback((
    e: React.MouseEvent,
    taskId: number,
    side: 'left' | 'right' | 'middle',
    startDate: string,
    endDate: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    setResizingTask({
      id: taskId,
      side,
      initialX: e.clientX,
      initialStartDate: startDate,
      initialEndDate: endDate
    });
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent, containerWidth: number) => {
    if (!resizingTask) return null;

    const deltaX = e.clientX - resizingTask.initialX;
    const totalDays = differenceInDays(ganttEndDate, ganttStartDate);
    const daysMoved = Math.round((deltaX / containerWidth) * totalDays);

    const currentStartDate = parseISO(resizingTask.initialStartDate);
    const currentEndDate = parseISO(resizingTask.initialEndDate);

    let newStartDate = resizingTask.initialStartDate;
    let newEndDate = resizingTask.initialEndDate;

    if (resizingTask.side === 'left') {
      // Resize da sinistra - modifica solo start date
      const proposedStartDate = addDays(currentStartDate, daysMoved);
      if (proposedStartDate < currentEndDate && proposedStartDate >= ganttStartDate) {
        newStartDate = format(proposedStartDate, 'yyyy-MM-dd');
      }
    } else if (resizingTask.side === 'right') {
      // Resize da destra - modifica solo end date
      const proposedEndDate = addDays(currentEndDate, daysMoved);
      if (proposedEndDate > currentStartDate && proposedEndDate <= ganttEndDate) {
        newEndDate = format(proposedEndDate, 'yyyy-MM-dd');
      }
    } else if (resizingTask.side === 'middle') {
      // Drag della barra intera - muove entrambe le date
      const taskDuration = differenceInDays(currentEndDate, currentStartDate);
      const proposedStartDate = addDays(currentStartDate, daysMoved);
      const proposedEndDate = addDays(proposedStartDate, taskDuration);
      
      if (proposedStartDate >= ganttStartDate && proposedEndDate <= ganttEndDate) {
        newStartDate = format(proposedStartDate, 'yyyy-MM-dd');
        newEndDate = format(proposedEndDate, 'yyyy-MM-dd');
      }
    }

    return { taskId: resizingTask.id, startDate: newStartDate, endDate: newEndDate };
  }, [resizingTask, ganttStartDate, ganttEndDate]);

  const stopResize = useCallback((finalDates: { startDate: string; endDate: string } | null) => {
    if (resizingTask && finalDates) {
      onDateChange(resizingTask.id, finalDates.startDate, finalDates.endDate);
    }
    setResizingTask(null);
  }, [resizingTask, onDateChange]);

  return {
    resizingTask,
    startResize,
    handleMouseMove,
    stopResize
  };
};
