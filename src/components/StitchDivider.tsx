/**
 * StitchDivider — elemento de assinatura da A&S Conccept.
 *
 * Reproduz o motivo da logo oficial: fio dourado de 1px com um diamante
 * (starburst de 4 pontas) ao centro, no lugar de um <hr /> genérico.
 * Usar com moderação: 1-2 por página.
 *
 * Variantes:
 *  - sem label → fio + diamante central
 *  - com label → fio — LABEL — fio
 */
export function StitchDivider({
  className = "",
  label,
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div className={`flex items-center gap-4 ${className}`} role="separator">
      <GoldLine />
      {label ? (
        <>
          <span className="asc-label shrink-0 text-asc-gold">{label}</span>
          <GoldLine />
        </>
      ) : (
        <Diamond />
      )}
    </div>
  );
}

function GoldLine() {
  return (
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-asc-gold/40 to-transparent" />
  );
}

function Diamond() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      className="shrink-0 text-asc-gold"
    >
      <path
        d="M5 0 L5.6 4.4 L10 5 L5.6 5.6 L5 10 L4.4 5.6 L0 5 L4.4 4.4 Z"
        fill="currentColor"
      />
    </svg>
  );
}
