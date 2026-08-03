import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Prose } from "@/components/PageShell";
import { SUPPORT_EMAIL } from "@/components/WhatsAppFab";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — A&S Conccept" },
      {
        name: "description",
        content:
          "Como a A&S Conccept coleta, usa e protege seus dados pessoais, em conformidade com a LGPD. Cookies, compartilhamento e exclusão de conta.",
      },
      { property: "og:title", content: "Política de Privacidade — A&S Conccept" },
      {
        property: "og:description",
        content: "Tratamento de dados pessoais em conformidade com a LGPD.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  return (
    <PageShell
      eyebrow="Compromisso"
      title="Política de Privacidade"
      intro="Tratamos os seus dados com discrição e propósito — apenas o necessário para atender bem."
    >
      <Prose title="O que coletamos">
        <p>
          Nome, e-mail, telefone e endereço de entrega, informados por você no cadastro e no
          checkout, além do histórico de pedidos. Dados de pagamento (número de cartão, CVV)
          são digitados diretamente no ambiente do Mercado Pago e nunca trafegam pelos nossos
          servidores.
        </p>
      </Prose>
      <Prose title="Como usamos">
        <p>
          Para processar pedidos, enviar atualizações de status, prestar atendimento e — caso
          você tenha assinado a newsletter — comunicar novidades da marca. Você pode cancelar a
          newsletter a qualquer momento pelo link no rodapé dos e-mails.
        </p>
      </Prose>
      <Prose title="Compartilhamento">
        <p>
          Compartilhamos dados apenas com quem é indispensável para a entrega do serviço:
          processador de pagamento, transportadora e provedor de e-mail transacional. Nunca
          vendemos ou cedemos dados para fins publicitários de terceiros.
        </p>
      </Prose>
      <Prose title="Segurança">
        <p>
          As informações trafegam por conexão criptografada (HTTPS) e o acesso ao banco de
          dados é restrito por políticas de permissão por usuário. Cada cliente só enxerga os
          próprios pedidos.
        </p>
      </Prose>
      <Prose title="Seus direitos (LGPD)">
        <p>
          Você pode solicitar acesso, correção, exportação ou exclusão dos seus dados a
          qualquer momento pelo e-mail {SUPPORT_EMAIL} ou pela opção de excluir a conta dentro
          de "Minha Conta". Alguns registros fiscais de pedidos podem ser mantidos pelo prazo
          exigido em lei.
        </p>
      </Prose>
      <Prose title="Cookies">
        <p>
          Usamos armazenamento local apenas para manter sua sessão ativa, guardar a sacola e os
          favoritos. Não utilizamos rastreamento invasivo nem revenda de perfil.
        </p>
      </Prose>
    </PageShell>
  );
}
