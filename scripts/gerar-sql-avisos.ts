/**
 * Regera `src/lib/sql-avisos.ts` a partir do arquivo de migração.
 *
 *   bun scripts/gerar-sql-avisos.ts
 *
 * O painel do admin entrega o SQL da migração de avisos para ele colar no
 * Supabase — as sessões não alcançam o banco de produção, e colar à mão é o
 * caminho de verdade quando o deploy não aplica a migração. O arquivo `.sql`
 * não viaja no bundle do navegador, então o texto precisa existir como módulo.
 *
 * A cópia e o original têm de ser idênticos, e `sql-avisos.test.ts` falha se
 * divergirem. Quando ele falhar, rode isto.
 */
import { readFileSync, writeFileSync } from "node:fs";

const MIGRACAO = "supabase/migrations/20260813120000_estoque_catalogo_avisos.sql";
const DESTINO = "src/lib/sql-avisos.ts";

const sql = readFileSync(MIGRACAO, "utf8");

// Crase, contrabarra e `${` são o que quebraria o template literal do módulo.
const escapado = sql.replace(/[\\`]/g, "\\$&").replace(/\$\{/g, "\\${");

const cabecalho = `/**
 * O SQL da migração de estoque e avisos, para o admin colar no Supabase.
 *
 * Cópia literal de \`${MIGRACAO}\`.
 * As duas têm de continuar iguais — \`sql-avisos.test.ts\` falha se divergirem,
 * e \`scripts/gerar-sql-avisos.ts\` regera este arquivo. Não edite à mão.
 *
 * Módulo separado porque são alguns kilobytes de texto: o painel o carrega sob
 * demanda (\`await import\`), só quando descobre que a tabela ainda não existe.
 */

export const SQL_AVISOS: string = \``;

writeFileSync(DESTINO, cabecalho + escapado + "`;\n");
console.log(`[sql-avisos] ${DESTINO} regerado a partir de ${MIGRACAO} (${sql.length} caracteres).`);
