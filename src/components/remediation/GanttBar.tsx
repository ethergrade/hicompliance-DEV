import React from 'react';
import { cn } from '@/lib/utils';
import { Settings, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

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
    progressWidth: number;
    duration: number;
  };
  isBeingDragged: boolean;
  onResizeStart: (e: React.MouseEvent, side: 'left' | 'right' | 'middle') => void;
  onEdit: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
}

export const GanttBar: React.FC<GanttBarProps> = ({
  task,
  isBeingDragged,
  onResizeStart,
  onEdit,
  onToggleVisibility,
  onDelete
}) => {
  return (
    <div className="flex items-center h-12 border-b border-border group relative">
      {/* Task Info */}
      <div className="w-64 px-4 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm font-medium truncate",
            task.isHidden && "opacity-50 line-through"
          )}>
            {task.task}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {task.category}
          </p>
        </div>
        <div className="flex items-center space-x-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onEdit}
          >
            <Settings className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onToggleVisibility}
          >
            {task.isHidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Gantt Timeline */}
      <div className="flex-1 relative h-full">
        <div
          className={cn(
            "absolute h-8 rounded-md transition-all cursor-move",
            isBeingDragged && "opacity-60 shadow-lg scale-105"
          )}
          style={{
            left: `${task.startOffset}%`,
            width: `${task.width}%`,
            backgroundColor: task.color || '#3b82f6',
            top: '50%',
            transform: 'translateY(-50%)'
          }}
          onMouseDown={(e) => onResizeStart(e, 'middle')}
        >
          {/* Progress Bar */}
          <div
            className="absolute inset-0 bg-white/20 rounded-md"
            style={{ width: `${task.progress}%` }}
          />

          {/* Resize Handles */}
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l-md"
            onMouseDown={(e) => {
              e.stopPropagation();
              onResizeStart(e, 'left');
            }}
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r-md"
            onMouseDown={(e) => {
              e.stopPropagation();
              onResizeStart(e, 'right');
            }}
          />

          {/* Task Info on Bar */}
          <div className="absolute inset-0 flex items-center justify-between px-2 text-xs text-white font-medium pointer-events-none">
            <span className="truncate">{task.duration}d</span>
            <span>{task.progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};
