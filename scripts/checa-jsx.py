"""Todo componente usado em JSX existe no arquivo (importado ou definido)?

Existe porque o `tsc` deste ambiente NÃO pega isso: com node_modules
incompleto ele para antes de checar identificadores, e um componente sem
import passa batido até quebrar na tela.

Como separa JSX de genérico: em `<Foo`, JSX tem o `<` precedido de espaço,
quebra de linha, `(`, `{`, `}`, `>` ou `,`; genérico (`useState<Foo>`) tem o
`<` colado num identificador ou noutro `<`.
"""
import re, sys, pathlib

ANTES_OK = set(" \t\n(){},>=&|?:;[")

falhas = []
for f in sorted(pathlib.Path("src").rglob("*.tsx")):
    src = f.read_text()

    disp = set()
    disp |= set(re.findall(r'import\s+(?:\*\s+as\s+)?(\w+)\s*(?:,|from)', src))
    for m in re.findall(r'import\s*(?:type\s*)?\{([^}]*)\}', src, re.S):
        for n in m.split(","):
            n = n.replace("type ", "").strip()
            if n:
                disp.add(n.split(" as ")[-1].strip())
    disp |= set(re.findall(r'\b(?:const|let|var|function|class)\s+(\w+)', src))
    # componentes recebidos por prop/destruturação
    disp |= {n for m in re.findall(r'\{([^{}]*)\}', src)
             for n in re.split(r'[,\s:]+', m) if n.isidentifier()}

    for m in re.finditer(r'<([A-Z][\w]*)(?:\.[\w.]+)?(?=[\s/>])', src):
        i = m.start()
        # `const f = <K extends ...>(...)` é declaração de genérico, não JSX.
        if re.match(r'\s+extends\b', src[m.end():]):
            continue
        if i > 0 and src[i - 1] not in ANTES_OK:
            continue                      # genérico: useState<Foo>
        nome = m.group(1)
        if nome in disp:
            continue
        falhas.append(f"{f}:{src[:i].count(chr(10)) + 1}  <{nome}> sem import nem definição")

print("\n".join(falhas) if falhas else "ok — todo componente JSX resolve")
sys.exit(1 if falhas else 0)
