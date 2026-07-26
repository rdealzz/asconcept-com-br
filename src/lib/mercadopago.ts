// Utilidades de frontend para o Mercado Pago (Checkout Bricks).
// A Public Key de produção é obtida do servidor (getMpPublicKey) para que a
// chave fique centralizada nos Secrets, sem precisar de build nova.

export const MAX_INSTALLMENTS = 12;

/** Paleta old money aplicada aos Bricks do Mercado Pago. */
export const brickCustomization = {
  visual: {
    style: {
      theme: "flat" as const,
      customVariables: {
        baseColor: "#B08D57",
        baseColorFirstVariant: "#9c7c4b",
        baseColorSecondVariant: "#8a6d41",
        textPrimaryColor: "#2B2B2B",
        textSecondaryColor: "#6B6B6B",
        inputBackgroundColor: "#FFFFFF",
        formBackgroundColor: "transparent",
        formPadding: "0px",
        borderRadiusSmall: "0px",
        borderRadiusMedium: "0px",
        borderRadiusLarge: "0px",
        borderRadiusFull: "0px",
        fontSizeExtraSmall: "11px",
        fontSizeSmall: "12px",
        fontSizeMedium: "14px",
        fontWeightNormal: "400",
        fontWeightSemiBold: "500",
        inputVerticalPadding: "12px",
        inputHorizontalPadding: "12px",
        outlinePrimaryColor: "#B08D57",
      },
    },
    texts: {
      formTitle: "",
      formSubmit: "Pagar com segurança",
      cardholderName: { label: "Nome impresso no cartão" },
      cardNumber: { label: "Número do cartão" },
      expirationDate: { label: "Validade" },
      securityCode: { label: "CVV" },
      installmentsSectionTitle: { label: "Parcelamento" },
      email: { label: "E-mail" },
    },
  },
  paymentMethods: {
    maxInstallments: MAX_INSTALLMENTS,
    types: { excluded: ["debit_card", "ticket", "bank_transfer"] },
  },
};

export function formatCpf(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function isValidCpf(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}
