import { useState } from "react";
import { Check, Heart, Link2, Share2 } from "lucide-react";
import { useFavorites } from "@/lib/favorites";
import { productParam } from "@/lib/variants";

/**
 * O link que o cliente compartilha.
 *
 * Era `/?produto=<id>` — um parâmetro que ninguém lê: quem recebia o link caía
 * na home, sem a peça. Agora é a página da própria peça, na mesma URL que a
 * vitrine usa, com a prévia (título e foto) que o `head` da rota monta. Isso
 * também é o que faz o compartilhamento de uma variação abrir naquela cor, e
 * não no álbum.
 */
function productUrl(productId: string, productName: string) {
  const caminho = `/produto/${productParam({ id: productId, name: productName })}`;
  if (typeof window === "undefined") return caminho;
  return `${window.location.origin}${caminho}`;
}

export function FavoriteButton({
  productId,
  className = "",
}: {
  productId: string;
  className?: string;
}) {
  const { isFavorite, toggle } = useFavorites();
  const active = isFavorite(productId);
  return (
    <button
      type="button"
      aria-label={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation();
        toggle(productId);
      }}
      className={`flex h-9 w-9 items-center justify-center border border-border bg-background/90 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--gold)] hover:shadow-md active:scale-95 ${className}`}
    >
      <Heart
        className={`h-4 w-4 transition-colors ${
          active ? "fill-[color:var(--gold)] text-[color:var(--gold)]" : "text-foreground"
        }`}
        strokeWidth={1.5}
      />
    </button>
  );
}

export function ShareButton({
  productId,
  productName,
  className = "",
}: {
  productId: string;
  productName: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(productUrl(productId, productName));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponível */
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Compartilhar produto"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-background/90 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--gold)] hover:shadow-md active:scale-95 ${className}`}
      >
        <Share2 className="h-4 w-4" strokeWidth={1.5} />
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-11 z-40 w-52 border border-border bg-background p-2"
        >
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              `${productName} — A&S Conccept ${productUrl(productId, productName)}`,
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-2 py-2 text-xs font-light transition-colors hover:text-accent"
          >
            <Share2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Enviar no WhatsApp
          </a>
          <button
            onClick={copy}
            className="flex w-full items-center gap-2 px-2 py-2 text-left text-xs font-light transition-colors hover:text-accent"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-[color:var(--gold)]" strokeWidth={1.5} /> Link
                copiado
              </>
            ) : (
              <>
                <Link2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Copiar link
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
