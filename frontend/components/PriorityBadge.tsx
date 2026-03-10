type Priority = "HIGH" | "MEDIUM" | "LOW";

const colorMap: Record<Priority, string> = {
  HIGH: "bg-red-50 text-red-700 border-red-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  LOW: "bg-teal-50 text-teal-700 border-teal-200",
};

interface PriorityBadgeProps {
  priority: Priority;
}

export default function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold border ${colorMap[priority]}`}
    >
      {priority}
    </span>
  );
}
