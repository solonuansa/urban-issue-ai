import { AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Priority = "HIGH" | "MEDIUM" | "LOW";

const configMap: Record<Priority, { color: string; icon: React.ReactNode }> = {
  HIGH: {
    color: "bg-red-500/10 text-red-600 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.15)]",
    icon: <AlertCircle className="w-3 h-3" />,
  },
  MEDIUM: {
    color: "bg-amber-500/10 text-amber-600 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.15)]",
    icon: <Clock className="w-3 h-3" />,
  },
  LOW: {
    color: "bg-teal-500/10 text-teal-600 border-teal-500/20 shadow-[0_0_10px_rgba(20,184,166,0.15)]",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
};

interface PriorityBadgeProps {
  priority: Priority;
  className?: string;
}

export default function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config = configMap[priority];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase border transition-all",
        config.color,
        className
      )}
    >
      {config.icon}
      {priority}
    </span>
  );
}
