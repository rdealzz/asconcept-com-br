const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken) {
    return (
      <div className="w-full border-b border-red-300 bg-red-100 px-4 py-2 text-center text-sm text-red-800">
        O checkout de produção ainda não foi configurado. Conclua a etapa de go-live para aceitar pagamentos reais.
      </div>
    );
  }
  if (clientToken.startsWith("pk_test_")) {
    return (
      <div className="w-full border-b border-orange-300 bg-orange-100 px-4 py-2 text-center text-xs text-orange-800 sm:text-sm">
        Ambiente de teste: use o cartão 4242 4242 4242 4242 com validade futura para simular um pagamento.
      </div>
    );
  }
  return null;
}
