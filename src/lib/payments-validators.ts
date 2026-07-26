// Validação e sanitização compartilhada do checkout Mercado Pago.
// Client-safe: usado nos inputValidator das server functions.

export const PIX_DISCOUNT_RATE = 0.05;
export const MAX_INSTALLMENTS = 12;

export type Size = "P" | "M" | "G" | "GG";
export type ItemInput = { id: string; quantity: number; size: Size };

export type CustomerInput = {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export type PendingOrderInput = {
  items: ItemInput[];
  couponCode: string | null;
  method: "card" | "pix";
  customer: CustomerInput;
};

export type CardInput = {
  orderNumber: string;
  token: string;
  paymentMethodId: string;
  issuerId: string | null;
  installments: number;
  payerEmail: string;
  cpf: string;
};

const UF_SET = new Set([
  "AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT",
  "PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO",
]);

export function sanitize(v: unknown, max = 200): string {
  const s = typeof v === "string" ? v : "";
  return s
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+=/gi, "")
    .trim()
    .slice(0, max);
}

export function validItems(raw: unknown): ItemInput[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("Sua sacola está vazia.");
  return raw.map((it) => {
    const size = (it as ItemInput)?.size;
    if (size !== "P" && size !== "M" && size !== "G" && size !== "GG") {
      throw new Error("Tamanho inválido em um dos itens.");
    }
    const id = (it as ItemInput)?.id;
    if (!id || typeof id !== "string") throw new Error("Produto inválido no carrinho.");
    const quantity = Math.max(
      1,
      Math.min(20, Math.floor(Number((it as ItemInput)?.quantity) || 0)),
    );
    return { id, quantity, size };
  });
}

export function validCustomer(raw: unknown): CustomerInput {
  const c = (raw ?? {}) as Partial<CustomerInput>;
  const out: CustomerInput = {
    name: sanitize(c.name, 120),
    email: sanitize(c.email, 254).toLowerCase(),
    phone: sanitize(c.phone, 20).replace(/\D/g, ""),
    cpf: sanitize(c.cpf, 20).replace(/\D/g, ""),
    cep: sanitize(c.cep, 9).replace(/\D/g, ""),
    logradouro: sanitize(c.logradouro, 160),
    numero: sanitize(c.numero, 20),
    complemento: sanitize(c.complemento ?? "", 80),
    bairro: sanitize(c.bairro, 120),
    cidade: sanitize(c.cidade, 120),
    uf: sanitize(c.uf, 2).toUpperCase(),
  };
  if (out.name.length < 3) throw new Error("Nome completo é obrigatório.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new Error("E-mail inválido.");
  if (out.phone.length < 10 || out.phone.length > 11) throw new Error("Telefone inválido.");
  if (out.cpf.length !== 11) throw new Error("CPF inválido.");
  if (out.cep.length !== 8) throw new Error("CEP inválido.");
  if (!out.logradouro) throw new Error("Endereço é obrigatório.");
  if (!out.numero) throw new Error("Número é obrigatório.");
  if (!out.bairro) throw new Error("Bairro é obrigatório.");
  if (!out.cidade) throw new Error("Cidade é obrigatória.");
  if (!UF_SET.has(out.uf)) throw new Error("UF inválida.");
  return out;
}

export function validPendingInput(raw: unknown): PendingOrderInput {
  const d = (raw ?? {}) as Partial<PendingOrderInput>;
  if (d.method !== "card" && d.method !== "pix") throw new Error("Forma de pagamento inválida.");
  return {
    items: validItems(d.items),
    couponCode: d.couponCode ? sanitize(d.couponCode, 40).toUpperCase() : null,
    method: d.method,
    customer: validCustomer(d.customer),
  };
}

export function validOrderNumber(raw: unknown): string {
  const orderNumber = sanitize(raw, 20);
  if (!/^AS-\d{6}$/.test(orderNumber)) throw new Error("Pedido inválido.");
  return orderNumber;
}

export function validCardInput(raw: unknown): CardInput {
  const d = (raw ?? {}) as Partial<CardInput>;
  const orderNumber = validOrderNumber(d.orderNumber);
  const token = sanitize(d.token, 120);
  const paymentMethodId = sanitize(d.paymentMethodId, 40);
  if (!token) throw new Error("Token do cartão ausente.");
  if (!paymentMethodId) throw new Error("Bandeira do cartão não identificada.");
  return {
    orderNumber,
    token,
    paymentMethodId,
    issuerId: d.issuerId ? sanitize(String(d.issuerId), 20) : null,
    installments: Math.max(
      1,
      Math.min(MAX_INSTALLMENTS, Math.floor(Number(d.installments) || 1)),
    ),
    payerEmail: sanitize(d.payerEmail, 254).toLowerCase(),
    cpf: sanitize(d.cpf, 20).replace(/\D/g, ""),
  };
}

export function validPixInput(raw: unknown): { orderNumber: string; cpf: string } {
  const d = (raw ?? {}) as { orderNumber?: string; cpf?: string };
  const orderNumber = validOrderNumber(d.orderNumber);
  const cpf = sanitize(d.cpf, 20).replace(/\D/g, "");
  if (cpf.length !== 11) throw new Error("CPF é obrigatório para pagamento via Pix.");
  return { orderNumber, cpf };
}
