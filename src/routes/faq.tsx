import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { SizeGuideTable } from "@/components/SizeGuide";
import { formatBRL } from "@/lib/cart-context";
import { FREE_SHIPPING_THRESHOLD } from "@/lib/shipping";
import { SUPPORT_EMAIL, WHATSAPP_DISPLAY } from "@/components/WhatsAppFab";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Perguntas Frequentes — A&S Conccept" },
      {
        name: "description",
        content:
          "Prazo de entrega, formas de pagamento, trocas, acompanhamento do pedido e autenticidade das peças da A&S Conccept.",
      },
      { property: "og:title", content: "Perguntas Frequentes — A&S Conccept" },
      {
        property: "og:description",
        content: "Tudo sobre entrega, pagamento, trocas e acompanhamento do seu pedido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FaqPage,
});

function Item({
  id,
  question,
  children,
  open,
  onToggle,
}: {
  id?: string;
  question: string;
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div id={id} className="border-b border-border scroll-mt-24">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-5 text-left transition-colors hover:text-accent"
      >
        <span className="font-serif text-base md:text-lg">{question}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          strokeWidth={1.5}
        />
      </button>
      {open && (
        <div className="pb-6 text-sm font-light leading-relaxed text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}

function FaqPage() {
  const [open, setOpen] = useState<string | null>("entrega");
  const t = (k: string) => () => setOpen((cur) => (cur === k ? null : k));

  return (
    <PageShell
      eyebrow="Ajuda"
      title="Perguntas Frequentes"
      intro="As dúvidas mais comuns sobre comprar na A&S Conccept. Não achou a sua? Fale com a gente."
    >
      <div className="-mt-4">
        <Item id="entrega" question="Qual o prazo de entrega?" open={open === "entrega"} onToggle={t("entrega")}>
          <p>
            As peças são despachadas em até 2 dias úteis após a confirmação do pagamento. A
            entrega leva, em média, de 3 a 10 dias úteis, conforme a região do CEP informado. O
            prazo exato aparece na calculadora de frete da página do produto e no checkout.
            Frete grátis para pedidos acima de {formatBRL(FREE_SHIPPING_THRESHOLD)}.
          </p>
        </Item>
        <Item question="Quais formas de pagamento são aceitas?" open={open === "pagamento"} onToggle={t("pagamento")}>
          <p>
            Cartão de crédito (Visa, Mastercard, Elo e demais bandeiras aceitas pelo Mercado
            Pago), com parcelamento sem juros conforme as condições vigentes da nossa conta, e
            Pix — com desconto aplicado automaticamente no checkout. Todo o processamento é
            feito pelo Mercado Pago; não armazenamos dados de cartão.
          </p>
        </Item>
        <Item question="Como funciona a troca ou devolução?" open={open === "trocas"} onToggle={t("trocas")}>
          <p>
            Você tem 7 dias corridos após o recebimento para desistir da compra, com a peça sem
            uso, com etiqueta e na embalagem original. Basta nos escrever em {SUPPORT_EMAIL} ou
            no WhatsApp {WHATSAPP_DISPLAY} com o número do pedido. Detalhes completos na página
            de Trocas e Devoluções.
          </p>
        </Item>
        <Item question="Como acompanho meu pedido?" open={open === "acompanhar"} onToggle={t("acompanhar")}>
          <p>
            Em "Meus Pedidos", dentro da sua conta, você vê o status em tempo real: Aguardando
            Aprovação, Preparando pedido, Em trânsito e Entregue. A cada mudança enviamos um
            e-mail, e o código de rastreio aparece assim que a peça é postada.
          </p>
        </Item>
        <Item question="Os produtos têm garantia de autenticidade?" open={open === "autenticidade"} onToggle={t("autenticidade")}>
          <p>
            Sim. Todas as peças são de produção própria ou adquiridas diretamente de
            fornecedores selecionados por nós, com conferência individual antes do envio. Em
            caso de defeito de fabricação, a troca é garantida.
          </p>
        </Item>
        <Item question="Como escolher o tamanho certo?" open={open === "tamanhos"} onToggle={t("tamanhos")}>
          <SizeGuideTable />
        </Item>
      </div>
    </PageShell>
  );
}
