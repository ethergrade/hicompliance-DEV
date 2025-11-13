import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import { Settings, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GanttBarProps {
  task: {
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
  };
  isBeingDragged: boolean;
  isDraggingVertically?: boolean;
  onResizeStart: (e: React.MouseEvent, side: 'left' | 'right' | 'middle') => void;
  onEdit: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

const GanttBarComponent: React.FC<GanttBarProps> = ({
  task,
  isBeingDragged,
  isDraggingVertically,
  onResizeStart,
  onEdit,
  onToggleVisibility,
  onDelete,
  onDragStart,
  onDragEnd
}) => {
  return (
    <div className={cn(
      "flex items-center min-h-[48px] border-b border-border/50 hover:bg-muted/30 group transition-opacity",
      isDraggingVertically && "opacity-50"
    )}>
      {/* Task Info - Width increased for better readability */}
      <div 
        className="w-80 px-3 py-2 flex items-center justify-between shrink-0 cursor-move"
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStart();
        }}
        onDragEnd={onDragEnd}
      >
        <div className="flex-1 min-w-0 mr-2">
          <p className={cn(
            "text-sm font-medium leading-tight mb-0.5",
            task.isHidden && "opacity-50 line-through"
          )}>
            {task.task}
          </p>
          <p className="text-xs text-muted-foreground leading-tight">
            {task.assignee}
          </p>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Settings className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility();
            }}
          >
            {task.isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Gantt Timeline */}
      <div className="flex-1 relative h-10 min-w-0">
        <div
          className={cn(
            "absolute h-7 rounded transition-all duration-75 cursor-grab active:cursor-grabbing hover:shadow-lg hover:scale-[1.02]",
            isBeingDragged && "opacity-80 shadow-xl scale-[1.01] cursor-grabbing"
          )}
          style={{
            left: `${task.startOffset}%`,
            width: `${task.width}%`,
            backgroundColor: task.color || '#3b82f6',
            top: '50%',
            transform: 'translateY(-50%)',
            willChange: isBeingDragged ? 'transform, opacity' : 'auto'
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            onResizeStart(e, 'middle');
          }}
        >
          {/* Progress Bar */}
          <div
            className="absolute inset-0 bg-white/20 rounded pointer-events-none"
            style={{ width: `${task.progress}%` }}
          />

          {/* Left Resize Handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 rounded-l opacity-0 group-hover:opacity-100 transition-all active:bg-white/60"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onResizeStart(e, 'left');
            }}
          />
          
          {/* Right Resize Handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 rounded-r opacity-0 group-hover:opacity-100 transition-all active:bg-white/60"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onResizeStart(e, 'right');
            }}
          />

          {/* Task Info on Bar */}
          <div className="absolute inset-0 flex items-center justify-between px-2 text-xs text-white font-medium pointer-events-none select-none">
            <span>{task.duration}d</span>
            <span>{task.progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const GanttBar = memo(GanttBarComponent);
