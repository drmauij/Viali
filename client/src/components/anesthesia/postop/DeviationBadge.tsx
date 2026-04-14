interface Props {
  leftPx: number;
  topPx: number;
  acknowledged: boolean;
  onClick: () => void;
  ariaLabel?: string;
}

export function DeviationBadge({ leftPx, topPx, acknowledged, onClick, ariaLabel }: Props) {
  const bg = acknowledged ? "bg-blue-500" : "bg-red-500";
  const hover = acknowledged ? "hover:bg-blue-600" : "hover:bg-red-600";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute z-40 w-4 h-4 rounded-full text-white text-[10px] font-bold leading-none flex items-center justify-center shadow-md ${bg} ${hover} transition-colors pointer-events-auto`}
      style={{ left: `${leftPx}px`, top: `${topPx}px`, transform: "translate(-50%, -50%)" }}
      aria-label={ariaLabel ?? (acknowledged ? "Deviation acknowledged" : "Deviation alert")}
    >
      !
    </button>
  );
}
