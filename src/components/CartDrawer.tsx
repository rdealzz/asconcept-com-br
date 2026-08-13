import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { X, Minus, Plus } from "lucide-react";
import { useCart, formatBRL, applyPixDiscount, PIX_ENABLED } from "@/lib/cart-context";
import { useCatalog } from "@/lib/catalog-context";
import { faltasDeEstoque, type PecaEmEstoque } from "@/lib/stock";
import { useAuth } from "@/lib/auth-context";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";
import { AVAILABLE_COUPONS, findCoupon, hasUsedCoupon } from "@/lib/coupons";
import { ShippingCalculator, FreeShippingHint } from "@/components/ShippingCalculator";
import { StitchDivider } from "@/components/StitchDivider";

/**
 * CartDrawer — sacola lateral.
 *
 * Mora no __root, e não na home: o cliente precisa conseguir abrir a sacola
 * de qualquer tela (página de produto, checkout, pedidos). Enquanto ficou
 * dentro da home, clicar no ícone em outra rota não abria nada.
 */
export function CartDrawer() {
  const { isOpen, close, items, remove, updateQty, subtotal, count } = useCart();
  const { user, openAuth } = useAuth();
  const { products, stock } = useCatalog();
  const navigate = useNavigate();
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null);

  /**
   * O que, na sacola, não pode mais ser comprado.
   *
   * A sacola vive no navegador e sobrevive a tudo: o cliente guarda a peça
   * hoje e volta amanhã, quando a última M já foi. O servidor recusa esse
   * pedido — é ele quem garante que ninguém compra sem estoque —, mas descobrir
   * isso só na tela de pagamento é frustração desnecessária. Aqui a linha diz
   * na hora, com o catálogo que o provider mantém atualizado.
   *
   * A mesma conta do servidor (`@/lib/stock`), para que as duas telas nunca
   * discordem sobre o que dá para vender.
   */
  const faltando = useMemo(() => {
    const pecas = new Map<string, PecaEmEstoque>(
      products.map((p) => [p.id, { id: p.id, name: p.name, sizes: stock[p.id] ?? {} }]),
    );
    // Peça que o catálogo ainda não trouxe não vira falta: enquanto ele
    // carrega, `products` é vazio, e acusar a sacola inteira de esgotada seria
    // mentira com cara de certeza.
    const naSacola = items.filter((i) => pecas.has(i.id));
    const porLinha = new Map<string, number>();
    for (const f of faltasDeEstoque(
      naSacola.map((i) => ({ id: i.id, size: i.size, quantity: i.qty })),
      pecas,
    )) {
      porLinha.set(`${f.id}-${f.size}`, f.disponivel);
    }
    return porLinha;
  }, [items, products, stock]);

  const onCheckout = () => {
    if (faltando.size > 0) {
      setCheckoutMsg(
        "Uma ou mais peças da sacola esgotaram. Ajuste as quantidades marcadas para continuar.",
      );
      return;
    }
    if (!user) {
      setCheckoutMsg("Você precisa entrar ou criar uma conta para finalizar a compra.");
      close();
      openAuth();
      return;
    }
    close();
    navigate({ to: "/checkout" });
  };

  return (
    <>
      {/* Véu escuro. Precisa ser escuro mesmo: asc-ink é o creme do texto, e
          usá-lo aqui clareava a página inteira por trás da sacola. */}
      <div
        onClick={close}
        className={`fixed inset-0 z-[60] bg-asc-bg-dark/70 backdrop-blur-sm transition-opacity duration-asc ease-asc ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        className={`fixed inset-y-0 right-0 z-[70] flex w-full flex-col border-l border-asc-line bg-asc-bg transition-transform duration-asc ease-asc sm:max-w-[420px] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!isOpen}
      >
        <div className="flex items-center justify-between border-b border-asc-line px-6 py-6">
          <div>
            <h2 className="font-display text-2xl text-asc-ink">Sua Sacola</h2>
            <p className="asc-label mt-1 text-[10px] text-asc-ink-muted">
              {count} {count === 1 ? "Peça" : "Peças"}
            </p>
          </div>
          <button
            onClick={close}
            aria-label="Fechar sacola"
            className="text-asc-ink transition-colors duration-ascfast ease-asc hover:text-asc-gold"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="asc-label text-asc-gold">A&amp;S Conccept</p>
              <p className="mt-6 font-display text-3xl leading-tight text-asc-ink">
                Sua sacola aguarda
                <br />a primeira peça.
              </p>
              <StitchDivider className="my-8 w-40" />
              <p className="max-w-[280px] font-sans text-sm font-light leading-relaxed text-asc-ink-muted">
                Cada edição é limitada e produzida em pequenas séries. Comece pela coleção da
                estação.
              </p>
              {/* Link em vez de setTab: a sacola abre em qualquer rota, então
                  não pode depender do estado de abas que só existe na home. */}
              <Link
                to="/"
                hash="produtos"
                onClick={close}
                className="asc-label mt-10 border border-asc-ink px-8 py-3 text-asc-ink transition-all duration-asc ease-asc hover:bg-asc-ink hover:text-asc-bg"
              >
                Ver Novidades
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8 border border-asc-line bg-asc-bg-raised p-4">
                <FreeShippingHint subtotal={subtotal} />
              </div>
              <ul className="divide-y divide-asc-line">
                {items.map((i) => {
                  const disponivel = faltando.get(`${i.id}-${i.size}`);
                  const emFalta = disponivel !== undefined;
                  return (
                    <li key={`${i.id}-${i.size}`} className="flex gap-4 py-6 first:pt-0">
                      <img
                        src={i.image}
                        alt={i.name}
                        loading="lazy"
                        decoding="async"
                        className="h-24 w-20 shrink-0 bg-asc-bg-raised object-cover"
                      />
                      <div className="flex flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-display text-base leading-snug text-asc-ink">
                            {i.name}
                          </h3>
                          <button
                            onClick={() => remove(i.id, i.size)}
                            aria-label="Remover"
                            className="text-asc-ink-muted transition-colors duration-ascfast ease-asc hover:text-asc-gold"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {/* A cor comprada, quando o cadastro a nomeia. O nome da
                          peça costuma trazê-la, mas não é obrigado: um álbum
                          pode ter nomes iguais e só a cor separando. */}
                        <p className="asc-label mt-1 text-[10px] text-asc-ink-muted">
                          Tamanho {i.size}
                          {i.colorLabel ? ` · ${i.colorLabel}` : ""}
                        </p>
                        {/* A peça esgotou depois de entrar na sacola. Dizer aqui,
                          e não só na tela de pagamento, é a diferença entre
                          ajustar em um clique e descobrir com o cartão na mão. */}
                        {emFalta && (
                          <p className="asc-label mt-1 text-[10px] text-asc-gold">
                            {disponivel === 0
                              ? "Esgotado — remova para continuar"
                              : `Restam ${disponivel} — ajuste a quantidade`}
                          </p>
                        )}
                        <div className="mt-auto flex items-center justify-between pt-4">
                          <div
                            className={`flex items-center border ${
                              emFalta ? "border-asc-gold" : "border-asc-line"
                            }`}
                          >
                            <button
                              onClick={() => updateQty(i.id, i.size, -1)}
                              aria-label="Diminuir"
                              className="flex h-8 w-8 items-center justify-center transition-colors duration-ascfast ease-asc hover:bg-asc-bg-raised"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-8 text-center font-sans text-sm tabular-nums">
                              {i.qty}
                            </span>
                            <button
                              onClick={() => updateQty(i.id, i.size, 1)}
                              aria-label="Aumentar"
                              // Sem estoque para subir: o botão para de crescer a
                              // sacola em vez de deixar o cliente montar um pedido
                              // que o servidor vai recusar.
                              disabled={emFalta}
                              className="flex h-8 w-8 items-center justify-center transition-colors duration-ascfast ease-asc hover:bg-asc-bg-raised disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <span className="font-sans text-sm tabular-nums text-asc-ink">
                            {formatBRL(i.price * i.qty)}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-8">
                <ShippingCalculator subtotal={subtotal} />
              </div>
            </>
          )}
        </div>

        {items.length > 0 && (
          <div className="space-y-4 border-t border-asc-line px-6 py-6">
            <CouponRow subtotal={subtotal} />
            <div className="flex items-center justify-between">
              <span className="asc-label text-[10px] text-asc-ink-muted">Subtotal</span>
              <span className="font-display text-xl tabular-nums text-asc-ink">
                {formatBRL(subtotal)}
              </span>
            </div>
            {PIX_ENABLED && (
              <p className="font-sans text-[11px] font-light italic tracking-wide text-asc-gold">
                ou {formatBRL(applyPixDiscount(subtotal))} no Pix (5% de desconto)
              </p>
            )}
            <p className="font-sans text-[11px] font-light text-asc-ink-muted">
              Frete cortesia acima de {formatBRL(FREE_SHIPPING_THRESHOLD)} · Embalagem do ateliê
              inclusa.
            </p>
            {checkoutMsg && <p className="font-sans text-[11px] text-asc-gold">{checkoutMsg}</p>}
            {/* text-asc-bg, não text-asc-ink-inverse: ink-inverse é o creme
                usado sobre fundos escuros, e aqui o fundo é o próprio creme —
                o texto sumia. */}
            <button
              onClick={onCheckout}
              className="asc-label w-full bg-asc-ink py-4 text-asc-bg transition-all duration-asc ease-asc hover:bg-asc-gold"
            >
              {user ? "Finalizar Compra" : "Entrar para Finalizar"}
            </button>
            {!user && (
              <p className="text-center font-sans text-[10px] text-asc-ink-muted">
                É necessário estar autenticado para prosseguir ao pagamento.
              </p>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

function CouponRow({ subtotal: _subtotal }: { subtotal: number }) {
  const { user, openAuth } = useAuth();
  const { couponCode, couponDiscount, setCoupon } = useCart();
  const [code, setCode] = useState(couponCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const apply = async () => {
    setError(null);
    if (!user) {
      openAuth();
      return;
    }
    const c = findCoupon(code);
    if (!c) {
      setError("Cupom inválido.");
      return;
    }
    setLoading(true);
    const already = await hasUsedCoupon(user.id, c.code);
    setLoading(false);
    if (already) {
      setError("Este cupom já foi utilizado por você.");
      return;
    }
    setCoupon(c);
  };

  const clear = () => {
    setCoupon(null);
    setCode("");
    setError(null);
  };

  if (couponCode) {
    return (
      <div className="flex items-center justify-between border border-asc-gold/50 bg-asc-gold/5 px-3 py-2 text-xs">
        <span className="tracking-luxe uppercase text-asc-gold">
          ✦ {couponCode} · − {formatBRL(couponDiscount)}
        </span>
        <button
          onClick={clear}
          className="text-[10px] tracking-luxe uppercase text-asc-ink-muted transition-colors duration-ascfast ease-asc hover:text-asc-error"
        >
          Remover
        </button>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Cupom"
          className="flex-1 border border-asc-line bg-transparent px-2 py-1.5 text-xs uppercase outline-none focus:border-asc-gold"
        />
        <button
          onClick={apply}
          disabled={loading}
          className="border border-asc-line px-3 py-1.5 text-[10px] tracking-luxe uppercase transition-colors duration-ascfast ease-asc hover:border-asc-gold hover:text-asc-gold disabled:opacity-50"
        >
          Aplicar
        </button>
      </div>
      {error && <p className="mt-1 text-[10px] text-asc-error">{error}</p>}
      {AVAILABLE_COUPONS.length > 0 && (
        <p className="mt-1 text-[10px] text-asc-ink-muted">
          Dica: use <span className="font-mono text-asc-gold">10%OFFF</span> — válido uma vez por
          cliente.
        </p>
      )}
    </div>
  );
}
