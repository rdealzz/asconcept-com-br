import { useState } from "react";
import { ShieldAlert } from "lucide-react";

/**
 * Painel · Produtos — o SQL que tranca a escrita no Storage.
 *
 * A migração `20260812150000_storage_objects_rls.sql` faz isto sozinha quando
 * consegue. Só que o papel que aplica migração no Lovable Cloud não é dono do
 * schema `storage`: quando falta privilégio, a migração avisa e segue em
 * frente, de propósito — derrubar o deploy inteiro por causa disso seria pior.
 *
 * Nesse caso a tranca continua faltando, e não há como o navegador descobrir
 * isso (a pergunta "esta tabela tem RLS?" não é pública). Então o SQL fica
 * aqui, à mão: colar no SQL Editor do Supabase, onde você é o dono, resolve de
 * uma vez. Rodar de novo não faz mal nenhum.
 */

const SQL = `-- Tranca a escrita no Storage: só admin escreve, e só no bucket da vitrine.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Product photos are public" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload product photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins update product photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete product photos" ON storage.objects;

CREATE POLICY "Product photos are public" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'product-photos');

CREATE POLICY "Admins upload product photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-photos'
    AND app_private.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins update product photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND app_private.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    bucket_id = 'product-photos'
    AND app_private.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins delete product photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-photos'
    AND app_private.has_role(auth.uid(), 'admin'::public.app_role)
  );`;

export function StorageSecurityNote() {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(SQL);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* área de transferência indisponível — o SQL está à vista mesmo assim */
    }
  };

  return (
    <details className="mt-8 border border-border">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-[10px] tracking-luxe uppercase text-muted-foreground transition-colors hover:text-accent">
        <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.5} />
        Segurança do Storage · SQL de verificação
      </summary>
      <div className="border-t border-border px-4 py-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          As fotos das peças vivem num bucket do Supabase. A escrita nele tem de ser só sua — sem a
          tranca, qualquer visitante consegue trocar ou apagar foto de peça. O deploy tenta ligar
          isso sozinho, mas nem sempre tem permissão sobre o schema <code>storage</code>, e daí ele
          avisa e segue. Se o aviso de segurança do Supabase ainda apontar{" "}
          <code className="text-accent">storage.objects</code>, cole este script no SQL Editor —
          rodar de novo não faz mal.
        </p>
        <pre className="mt-3 max-h-72 overflow-auto border border-border bg-background/60 p-3 text-[10px] leading-relaxed text-muted-foreground">
          {SQL}
        </pre>
        <button
          onClick={() => void copiar()}
          className="asc-btn-primary mt-3 px-3 py-1.5 text-[10px] tracking-luxe uppercase"
        >
          {copiado ? "SQL copiado" : "Copiar SQL"}
        </button>
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          O envio de fotos pelo painel não é afetado: ele passa pelo servidor, que escreve com a
          chave de serviço e não depende dessas regras.
        </p>
      </div>
    </details>
  );
}
