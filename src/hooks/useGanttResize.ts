import { useCallback, useRef } from 'react';
import { format, addDays, differenceInCalendarDays, parseISO } from 'date-fns';

interface UseGanttDragProps {
  onDateChange: (taskId: string, startDate: string, endDate: string) => void;
  ganttStartDate: Date;
  ganttEndDate: Date;
  getTimelineWidth: () => number;
}

export const useGanttDrag = ({
  onDateChange,
  ganttStartDate,
  ganttEndDate,
  getTimelineWidth,
}: UseGanttDragProps) => {
  void onDateChange;

  const dragging = useRef<{
    id: string;
    side: 'left' | 'right' | 'middle';
    startX: number;
    origStart: string;
    origEnd: string;
    onMove: (sd: string, ed: string) => void;
  } | null>(null);

  const totalDays = Math.max(1, differenceInCalendarDays(ganttEndDate, ganttStartDate) + 1);

  const applyDrag = useCallback((clientX: number) => {
    const d = dragging.current;
    if (!d) return;

    const containerWidth = getTimelineWidth();
    if (containerWidth <= 0) return;

    const deltaX = clientX - d.startX;
    const daysMoved = Math.round((deltaX / containerWidth) * totalDays);

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
      const dur = differenceInCalendarDays(origE, origS);
      const ps = addDays(origS, daysMoved);
      const pe = addDays(ps, dur);
      if (ps >= ganttStartDate && pe <= ganttEndDate) {
        ns = format(ps, 'yyyy-MM-dd');
        ne = format(pe, 'yyyy-MM-dd');
      }
    }

    d.onMove(ns, ne);
  }, [ganttEndDate, ganttStartDate, getTimelineWidth, totalDays]);

  const onPointerDown = useCallback(
    (
      e: React.PointerEvent,
      taskId: string,
      side: 'left' | 'right' | 'middle',
      startDate: string,
      endDate: string,
      onLiveMove: (sd: string, ed: string) => void,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

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
    (e: Pick<PointerEvent, 'clientX'> | Pick<React.PointerEvent, 'clientX'>) => {
      applyDrag(e.clientX);
    },
    [applyDrag],
  );

  const onPointerUp = useCallback(
    (_e: React.PointerEvent) => {
      dragging.current = null;
    },
    [],
  );

  return { onPointerDown, onPointerMove, onPointerUp, dragging };
};
