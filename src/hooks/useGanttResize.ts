import { useCallback, useRef } from 'react';
import { format, addDays, differenceInDays, parseISO } from 'date-fns';

interface UseGanttDragProps {
  onDateChange: (taskId: number, startDate: string, endDate: string) => void;
  ganttStartDate: Date;
  ganttEndDate: Date;
  getTimelineWidth: () => number;
}

/**
 * Pointer-event based drag hook for Gantt bars.
 * Supports move (middle), resize-left and resize-right.
 * Returns helpers that attach to the bar's onPointerDown.
 */
export const useGanttDrag = ({
  onDateChange,
  ganttStartDate,
  ganttEndDate,
  getTimelineWidth,
}: UseGanttDragProps) => {
  const dragging = useRef<{
    id: number;
    side: 'left' | 'right' | 'middle';
    startX: number;
    origStart: string;
    origEnd: string;
    onMove: (sd: string, ed: string) => void;
  } | null>(null);

  const totalDays = differenceInDays(ganttEndDate, ganttStartDate);

  const onPointerDown = useCallback(
    (
      e: React.PointerEvent,
      taskId: number,
      side: 'left' | 'right' | 'middle',
      startDate: string,
      endDate: string,
      onLiveMove: (sd: string, ed: string) => void,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      dragging.current = {
        id: taskId,
        side,
        startX: e.clientX,
        origStart: startDate,
        origEnd: endDate,
        onMove: onLiveMove,
      };
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragging.current;
      if (!d) return;

      const containerWidth = getTimelineWidth();
      if (containerWidth <= 0) return;

      const deltaX = e.clientX - d.startX;
      const daysMoved = Math.round((deltaX / containerWidth) * totalDays);
      if (daysMoved === 0 && d.side !== 'middle') return;

      const origS = parseISO(d.origStart);
      const origE = parseISO(d.origEnd);
      let ns = d.origStart;
      let ne = d.origEnd;

      if (d.side === 'left') {
        const p = addDays(origS, daysMoved);
        if (p < origE && p >= ganttStartDate) ns = format(p, 'yyyy-MM-dd');
      } else if (d.side === 'right') {
        const p = addDays(origE, daysMoved);
        if (p > origS && p <= ganttEndDate) ne = format(p, 'yyyy-MM-dd');
      } else {
        const dur = differenceInDays(origE, origS);
        const ps = addDays(origS, daysMoved);
        const pe = addDays(ps, dur);
        if (ps >= ganttStartDate && pe <= ganttEndDate) {
          ns = format(ps, 'yyyy-MM-dd');
          ne = format(pe, 'yyyy-MM-dd');
        }
      }

      d.onMove(ns, ne);
    },
    [ganttStartDate, ganttEndDate, totalDays, getTimelineWidth],
  );

  const onPointerUp = useCallback(
    (_e: React.PointerEvent) => {
      const d = dragging.current;
      if (!d) return;
      // Final dates already applied live — commit to DB
      // We read the latest dates from the live callback
      dragging.current = null;
    },
    [],
  );

  /** Call this from the bar after pointer up with the final dates */
  const commit = useCallback(
    (taskId: number, startDate: string, endDate: string) => {
      onDateChange(taskId, startDate, endDate);
    },
    [onDateChange],
  );

  return { onPointerDown, onPointerMove, onPointerUp, commit, dragging };
};
