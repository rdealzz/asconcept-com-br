import { useEffect, useMemo, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { productImageSrc } from "@/lib/product-images";

/** Largura em que a peça é exibida no palco, em ambos os usos. */
const TURNTABLE_WIDTH = 1000;

/**
 * A peça que gira.
 *
 * É a adaptação da lata 3D da referência para uma loja de roupas: em vez de um
 * modelo GLB, a peça é montada como um objeto de duas faces em CSS 3D. Arrastar
 * gira; cada meia-volta revela a próxima foto da galeria, então a sensação é a
 * de virar a peça na mão e ver o outro lado. Sem ponteiro em cima, ela inclina
 * de leve na direção do cursor, como a lata faz.
 *
 * Nada aqui usa biblioteca de animação nem WebGL: é um único requestAnimationFrame
 * que só existe enquanto há movimento e enquanto a peça está na tela. Quando ela
 * assenta, o laço morre — página parada não gasta quadro.
 */

const mod = (n: number, m: number) => ((n % m) + m) % m;
const easeInQuad = (t: number) => t * t;
const easeOutBack = (t: number) => {
  const c = 1.42;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/**
 * Depois de um toque, o navegador ainda sintetiza um clique — e ele é
 * posicionado de novo, agora sobre o que o toque acabou de abrir (a foto em
 * tela cheia, a página da peça). O resultado é abrir e fechar no mesmo gesto.
 * Engolimos esse único clique-fantasma.
 */
function engolirCliqueFantasma() {
  if (typeof window === "undefined") return;
  let limpar = 0;
  const engolir = (ev: MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
    window.removeEventListener("click", engolir, true);
    window.clearTimeout(limpar);
  };
  window.addEventListener("click", engolir, true);
  limpar = window.setTimeout(() => window.removeEventListener("click", engolir, true), 400);
}

/** Graus girados por pixel arrastado. */
const GRAUS_POR_PIXEL = 0.42;
/** Duração da virada coreografada ao trocar de peça. */
const VIRADA_S = 1.5;
/** Momento (0–1) em que a foto nova entra, no auge do borrão. */
const VIRADA_TROCA = 0.35;

type Estado = {
  ang: number;
  vel: number;
  /** Inclinação atual e alvo, em graus. */
  tx: number;
  ty: number;
  alvoTx: number;
  alvoTy: number;
  escala: number;
  alvoEscala: number;
  borrao: number;
  arrastando: boolean;
  ultimoX: number;
  /** Índice da foto voltada para quem olha. */
  idx: number;
  /** Última meia-volta contabilizada. */
  k: number;
  /** Cronômetro da virada; 0 = parada. */
  virada: number;
  viradaDur: number;
  viradaDe: number;
  viradaPara: number;
  /** Virada de troca de peça: congela o índice e troca a foto no auge. */
  trocaPeca: boolean;
  trocou: boolean;
};

export function GarmentTurntable({
  images,
  alt,
  swapId,
  onOpen,
  onIndex,
  goTo,
  className = "",
  imageClassName = "",
  fit = "contain",
  hint,
}: {
  images: string[];
  alt: string;
  /** Muda quando a peça muda — dispara a virada coreografada. */
  swapId: string;
  /** Clique curto (sem arrasto) — abre a foto ou a página da peça. */
  onOpen?: () => void;
  /** Avisa qual foto está voltada para quem olha. */
  onIndex?: (i: number) => void;
  /** Gira até esta foto da galeria (miniaturas). */
  goTo?: number;
  className?: string;
  imageClassName?: string;
  /**
   * `cover` preenche a moldura (vira painel, como na vitrine da home);
   * `contain` mostra a foto inteira (página do produto).
   */
  fit?: "contain" | "cover";
  /** Texto da dica de arraste. `null` esconde. */
  hint?: string | null;
}) {
  const palco = useRef<HTMLDivElement>(null);
  const plano = useRef<HTMLDivElement>(null);
  const frente = useRef<HTMLImageElement>(null);
  const verso = useRef<HTMLImageElement>(null);

  /**
   * O palco troca o `src` das duas faces na mão, durante o giro, então não dá
   * para deixar o navegador escolher a variante por `srcset` — a escolha teria
   * de ser refeita a cada virada. Resolvemos aqui, uma vez, na largura em que a
   * peça é exibida; a mesma URL vale para a pré-carga e para o JSX, então o
   * cache é aproveitado em vez de dividido entre dois tamanhos.
   */
  const srcs = useMemo(() => images.map((s) => productImageSrc(s, TURNTABLE_WIDTH)), [images]);

  const fotos = useRef<string[]>(srcs);
  const pendentes = useRef<string[] | null>(null);
  const idAtual = useRef(swapId);

  const est = useRef<Estado>({
    ang: 0,
    vel: 0,
    tx: 0,
    ty: 0,
    alvoTx: 0,
    alvoTy: 0,
    escala: 1,
    alvoEscala: 1,
    borrao: 0,
    arrastando: false,
    ultimoX: 0,
    idx: 0,
    k: 0,
    virada: 0,
    viradaDur: VIRADA_S,
    viradaDe: 0,
    viradaPara: 0,
    trocaPeca: false,
    trocou: false,
  });

  const raf = useRef(0);
  const naTela = useRef(true);
  const acordar = useRef<() => void>(() => {});
  const aoIndice = useRef(onIndex);
  aoIndice.current = onIndex;
  const destinoAplicado = useRef(goTo ?? 0);
  /** Repinta as duas faces — usada também fora do laço. */
  const aplicar = useRef<() => void>(() => {});

  /* ── laço de animação ───────────────────────────────────────────── */
  useEffect(() => {
    const el = plano.current;
    if (!el) return;

    const reduzido = prefersReducedMotion();
    let ultimo = 0;

    const aplicarFotos = () => {
      const lista = fotos.current;
      if (!lista.length) return;
      const s = est.current;
      const n = lista.length;
      const dir = s.vel >= 0 ? 1 : -1;
      // Na troca de peça as duas faces mostram a foto nova: o borrão esconde a
      // substituição e não há índice para acompanhar.
      const daFrente = s.trocaPeca ? lista[0] : lista[mod(s.idx, n)];
      const doVerso = s.trocaPeca ? lista[0] : lista[mod(s.idx + dir, n)];
      const par = mod(s.k, 2) === 0;
      const aFrente = par ? daFrente : doVerso;
      const aoVerso = par ? doVerso : daFrente;
      if (frente.current && frente.current.dataset.src !== aFrente) {
        frente.current.dataset.src = aFrente;
        frente.current.src = aFrente;
      }
      if (verso.current && verso.current.dataset.src !== aoVerso) {
        verso.current.dataset.src = aoVerso;
        verso.current.src = aoVerso;
      }
    };

    aplicar.current = aplicarFotos;

    const pintar = () => {
      const s = est.current;
      el.style.transform = `rotateX(${s.tx.toFixed(2)}deg) rotateY(${(s.ang + s.ty).toFixed(2)}deg) scale(${s.escala.toFixed(3)})`;
      el.style.filter = s.borrao > 0.15 ? `blur(${s.borrao.toFixed(2)}px)` : "";
    };

    const quadro = (t: number) => {
      const s = est.current;
      // O carimbo que o requestAnimationFrame entrega é o do início do quadro,
      // que pode ser ANTERIOR ao relógio lido na hora de agendar. Sem esta
      // trava o primeiro passo saía negativo, o cronômetro da virada nascia
      // negativo e o laço rodava para sempre sem animar nada.
      const dt = ultimo ? Math.min(0.05, Math.max(0.001, (t - ultimo) / 1000)) : 0.016;
      ultimo = t;
      raf.current = 0;

      // Virada coreografada: troca de peça, ou giro até uma foto escolhida.
      if (s.virada > 0) {
        s.virada = Math.min(s.viradaDur, s.virada + dt);
        const u = s.virada / s.viradaDur;
        const p =
          u < VIRADA_TROCA
            ? 0.5 * easeInQuad(u / VIRADA_TROCA)
            : 0.5 + 0.5 * easeOutBack((u - VIRADA_TROCA) / (1 - VIRADA_TROCA));
        s.ang = s.viradaDe + (s.viradaPara - s.viradaDe) * p;
        s.borrao = (s.trocaPeca ? 9 : 5) * Math.sin(Math.PI * u);
        if (s.trocaPeca && !s.trocou && u >= VIRADA_TROCA) {
          s.trocou = true;
          if (pendentes.current) {
            fotos.current = pendentes.current;
            pendentes.current = null;
          }
          s.idx = 0;
          aplicarFotos();
        }
        if (u >= 1) {
          s.ang = s.viradaPara;
          s.virada = 0;
          s.borrao = 0;
          s.vel = 0;
          if (s.trocaPeca) {
            // A peça nova encara quem olha: índice zerado e faces repintadas.
            s.trocaPeca = false;
            s.trocou = false;
            s.idx = 0;
            s.k = Math.round(s.ang / 180);
            aplicarFotos();
          }
          // No giro até uma foto, quem fecha a conta é a checagem de meia-volta
          // logo abaixo — mexer em `k` aqui engoliria o último avanço de índice.
        }
      } else if (!s.arrastando) {
        // Inércia: a peça continua girando e vai parando sozinha.
        s.ang += s.vel * dt;
        s.vel *= Math.pow(0.12, dt);
        if (Math.abs(s.vel) < 6) s.vel = 0;
        s.borrao = Math.min(6, Math.abs(s.vel) / 260);
      } else {
        s.borrao = 0;
      }

      // Inclinação e escala perseguem o alvo.
      const k = 1 - Math.pow(0.002, dt);
      s.tx += (s.alvoTx - s.tx) * k;
      s.ty += (s.alvoTy - s.ty) * k;
      s.escala += (s.alvoEscala - s.escala) * k;

      // Meia-volta cruzada: avança a foto.
      const kNovo = Math.round(s.ang / 180);
      if (kNovo !== s.k) {
        if (!s.trocaPeca) {
          const antes = s.idx;
          s.idx = mod(s.idx + (kNovo - s.k), Math.max(1, fotos.current.length));
          if (s.idx !== antes) aoIndice.current?.(s.idx);
        }
        s.k = kNovo;
        aplicarFotos();
      }

      pintar();

      // `<= 0` e não `=== 0`: se o cronômetro escorregar para um negativo
      // qualquer, o laço tem de conseguir dormir do mesmo jeito.
      const parado =
        s.virada <= 0 &&
        !s.arrastando &&
        s.vel === 0 &&
        Math.abs(s.alvoTx - s.tx) < 0.05 &&
        Math.abs(s.alvoTy - s.ty) < 0.05 &&
        Math.abs(s.alvoEscala - s.escala) < 0.002;

      if (parado) {
        // Encaixa nos valores finais e desliga o laço até o próximo gesto.
        s.tx = s.alvoTx;
        s.ty = s.alvoTy;
        s.escala = s.alvoEscala;
        s.borrao = 0;
        pintar();
        return;
      }
      raf.current = requestAnimationFrame(quadro);
    };

    const acordarLaco = () => {
      if (raf.current || !naTela.current || reduzido) return;
      ultimo = 0; // o primeiro quadro depois de acordar usa o passo padrão
      raf.current = requestAnimationFrame(quadro);
    };
    acordar.current = acordarLaco;

    aplicarFotos();
    pintar();

    // Fora da tela o laço nem começa.
    const io = new IntersectionObserver(
      ([e]) => {
        naTela.current = e.isIntersecting;
        if (!e.isIntersecting && raf.current) {
          cancelAnimationFrame(raf.current);
          raf.current = 0;
        } else if (e.isIntersecting) {
          acordarLaco();
        }
      },
      { rootMargin: "20% 0px" },
    );
    if (palco.current) io.observe(palco.current);

    return () => {
      io.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, []);

  /* ── troca de peça ──────────────────────────────────────────────── */
  useEffect(() => {
    const s = est.current;
    if (idAtual.current === swapId) {
      // Mesma peça: a galeria só terminou de chegar. Entra sem animação.
      fotos.current = srcs;
      aplicar.current();
      return;
    }
    idAtual.current = swapId;
    if (prefersReducedMotion()) {
      fotos.current = srcs;
      s.idx = 0;
      s.trocaPeca = false;
      destinoAplicado.current = 0;
      aplicar.current();
      return;
    }
    pendentes.current = srcs;
    s.virada = 0.0001;
    s.viradaDur = VIRADA_S;
    s.trocaPeca = true;
    s.trocou = false;
    s.viradaDe = s.ang;
    // Termina numa volta inteira: a peça volta a encarar quem olha.
    s.viradaPara = Math.ceil((s.ang + 720) / 360) * 360;
    destinoAplicado.current = 0;
    acordar.current();
  }, [swapId, srcs]);

  /* ── giro até uma foto escolhida (miniaturas) ───────────────────── */
  useEffect(() => {
    if (goTo === undefined) return;
    const s = est.current;
    const n = fotos.current.length;
    if (n < 2 || goTo === destinoAplicado.current) return;
    destinoAplicado.current = goTo;
    // Quantas meias-voltas até a foto pedida ficar de frente.
    const passos = mod(goTo - s.idx, n);
    if (passos === 0) return;
    if (prefersReducedMotion()) {
      s.idx = goTo;
      aplicar.current();
      return;
    }
    s.virada = 0.0001;
    s.viradaDur = 0.55 + passos * 0.22;
    s.trocaPeca = false;
    s.viradaDe = s.ang;
    s.viradaPara = s.ang + passos * 180;
    acordar.current();
  }, [goTo]);

  /* ── gestos ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    const s = est.current;
    let inicioX = 0;
    let inicioY = 0;
    let inicioT = 0;
    let arrastou = false;
    let idPonteiro: number | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      idPonteiro = e.pointerId;
      s.arrastando = true;
      s.vel = 0;
      s.ultimoX = e.clientX;
      inicioX = e.clientX;
      inicioY = e.clientY;
      inicioT = performance.now();
      arrastou = false;
      s.alvoEscala = 1.03;
      el.setPointerCapture(e.pointerId);
      acordar.current();
    };

    const onMove = (e: PointerEvent) => {
      if (s.arrastando && e.pointerId === idPonteiro) {
        const dx = e.clientX - s.ultimoX;
        s.ultimoX = e.clientX;
        s.ang += dx * GRAUS_POR_PIXEL;
        // Velocidade para a inércia da soltura.
        s.vel = dx * GRAUS_POR_PIXEL * 60;
        if (Math.abs(e.clientX - inicioX) > 6 || Math.abs(e.clientY - inicioY) > 6) arrastou = true;
        acordar.current();
        return;
      }
      // Sem arrasto: a peça inclina na direção do cursor, como a lata.
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      s.alvoTx = -py * 14;
      s.alvoTy = px * 16;
      acordar.current();
    };

    const soltar = (e: PointerEvent, cancelado = false) => {
      if (e.pointerId !== idPonteiro) return;
      idPonteiro = null;
      s.arrastando = false;
      s.alvoEscala = 1;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      // Clique curto e parado abre a peça; arrasto não. Cancelamento também
      // não: no celular ele é o navegador assumindo a rolagem vertical, e
      // abrir a peça aí seria um clique que ninguém deu.
      if (!cancelado && !arrastou && performance.now() - inicioT < 400) {
        if (e.pointerType !== "mouse") engolirCliqueFantasma();
        onOpen?.();
      }
      acordar.current();
    };

    const onUp = (e: PointerEvent) => soltar(e);
    const onCancel = (e: PointerEvent) => soltar(e, true);

    const onLeave = () => {
      s.alvoTx = 0;
      s.alvoTy = 0;
      acordar.current();
    };

    const onKey = (e: KeyboardEvent) => {
      // O arrasto é gesto de ponteiro; pelo teclado, as setas giram e
      // Enter/Espaço fazem o mesmo que o clique curto.
      if ((e.key === "Enter" || e.key === " ") && onOpen) {
        e.preventDefault();
        onOpen();
        return;
      }
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      s.vel = e.key === "ArrowRight" ? 900 : -900;
      acordar.current();
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("keydown", onKey);
    };
  }, [onOpen]);

  /* ── pré-carga: a foto do outro lado não pode chegar durante o giro ── */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const aquecer = (lista: string[]) => {
      for (const src of lista) {
        const i = new Image();
        i.decoding = "async";
        i.src = src;
      }
    };

    // As duas primeiras são as faces visíveis já na primeira meia-volta, então
    // vão junto. O resto só é preciso depois de o cliente girar algumas vezes —
    // buscá-las agora tiraria banda da foto que ele está olhando.
    aquecer(srcs.slice(0, 2));

    const resto = srcs.slice(2, 5);
    if (!resto.length) return;
    const ocioso = window.requestIdleCallback;
    if (!ocioso) {
      const t = window.setTimeout(() => aquecer(resto), 1200);
      return () => window.clearTimeout(t);
    }
    const id = ocioso(() => aquecer(resto), { timeout: 3000 });
    return () => window.cancelIdleCallback?.(id);
  }, [srcs]);

  if (!srcs.length) return null;

  const umaFoto = srcs.length < 2;

  return (
    <div
      ref={palco}
      tabIndex={0}
      role="group"
      aria-label={`${alt} — arraste, ou use as setas do teclado, para girar a peça`}
      className={`group relative cursor-grab touch-pan-y select-none outline-none active:cursor-grabbing ${className}`}
      style={{ perspective: "1600px" }}
    >
      <div
        ref={plano}
        className="relative h-full w-full transform-style-3d will-change-transform"
        style={{ transformStyle: "preserve-3d" }}
      >
        <img
          ref={frente}
          src={srcs[0]}
          alt={alt}
          draggable={false}
          decoding="async"
          className={`pointer-events-none mx-auto h-full w-full backface-hidden ${fit === "cover" ? "object-cover" : "object-contain"} ${imageClassName}`}
        />
        <img
          ref={verso}
          src={srcs[1] ?? srcs[0]}
          alt=""
          aria-hidden
          draggable={false}
          decoding="async"
          className={`pointer-events-none absolute inset-0 mx-auto h-full w-full backface-hidden ${fit === "cover" ? "object-cover" : "object-contain"} ${imageClassName}`}
          style={{
            transform: "rotateY(180deg)",
            // Com uma foto só, o verso escurece de leve para ler como o avesso
            // da peça em vez de parecer que nada girou.
            filter: umaFoto ? "brightness(0.78) saturate(0.85)" : undefined,
          }}
        />
      </div>

      {hint !== null && (
        <span className="asc-label pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-asc-line bg-asc-bg-dark/60 px-3 py-1.5 text-[10px] text-asc-ink-muted opacity-70 backdrop-blur transition-opacity duration-asc ease-asc group-hover:opacity-0">
          {hint ?? "Arraste para girar"}
        </span>
      )}
    </div>
  );
}
