/**
 * StitchDivider — elemento de assinatura da A&S Conccept.
 *
 * Uma linha de costura dourada (ponto de alfaiate) no lugar de um <hr />
 * genérico. Usar com moderação: 1-2 por página.
 */
export function StitchDivider({
  className = "",
  label,
}: {
  className?: string;
  label?: string;
}) {
  const line = (
    <svg
      className="h-[9px] flex-1 text-asc-gold-soft"
      preserveAspectRatio="none"
      viewBox="0 0 400 9"
      fill="none"
      aria-hidden
    >
      <line
        x1="0"
        y1="4.5"
        x2="400"
        y2="4.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="7 6"
        strokeLinecap="round"
      />
    </svg>
  );

  return (
    <div className={`flex items-center gap-4 ${className}`} role="separator">
      {line}
      {label && <span className="asc-label shrink-0 text-asc-gold">{label}</span>}
      {label && line}
    </div>
  );
}
