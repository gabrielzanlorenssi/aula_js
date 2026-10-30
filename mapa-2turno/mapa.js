// Mapa de apuração do 2º turno presidencial de 2026 por município.
// Lê os arquivos oficiais do TSE direto no navegador (o TSE responde com CORS).
// Para testar com um servidor local que imita o TSE: index.html?base=http://localhost:8000

const params = new URLSearchParams(location.search);

const CONFIG = {
    base: params.get("base") || "https://resultados.tse.jus.br",
    ambiente: "oficial",
    ciclo: "ele2026",
    eleicao: "6258", // 2º turno federal, conferido no ele-c.json do TSE
    cargo: 1, // presidente
    // Ordem fixa na tela; os nomes do TSE vêm sem acento, por isso ficam aqui
    candidatos: [
        { numero: "13", nome: "Lula", cor: "#b2182b", cores: ["#fddbc7", "#f4a582", "#d6604d", "#b2182b"] },
        { numero: "22", nome: "Flávio Bolsonaro", cor: "#2166ac", cores: ["#d1e5f0", "#92c5de", "#4393c3", "#2166ac"] }
    ],
    // Faixas de % dos votos válidos do vencedor no município
    faixas: [50, 55, 60, 70],
    corEmpate: "#5e6470",
    corSemDado: "#e3e5e8",
    paralelo: 24, // requisições simultâneas ao TSE (limite oficial: 100 por segundo)
    maxFalhasSeguidas: 15, // muitos 404 seguidos fazem o TSE bloquear o IP
    chaveCache: "apuracao-2t-6258-v1"
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
    "agosto", "setembro", "outubro", "novembro", "dezembro"];

const fmtInt = new Intl.NumberFormat("pt-BR");
const fmtPct = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ele6 = CONFIG.eleicao.padStart(6, "0");
const cargo4 = String(CONFIG.cargo).padStart(4, "0");
const raiz = `${CONFIG.base}/${CONFIG.ambiente}/${CONFIG.ciclo}/${CONFIG.eleicao}`;

const url = {
    config: () => `${CONFIG.base}/${CONFIG.ambiente}/comum/config/ele-c.json`,
    municipios: () => `${raiz}/config/mun-e${ele6}-cm.json`,
    recorte: (abr) => `${raiz}/dados/${abr}/${abr}-c${cargo4}-e${ele6}-u.json`,
    municipio: (uf, cd) => `${raiz}/dados/${uf}/${uf}${cd}-c${cargo4}-e${ele6}-u.json`
};

// Estado da página
const estado = {
    ufs: [], // [{ sigla, nome, municipios: [{ cd, cdi, nm }] }]
    tsePorIbge: new Map(),
    resultados: new Map(), // código TSE do município -> resultado lido
    recortes: new Map(), // "br" ou sigla da UF -> resultado lido
    feicoes: null,
    ufsGeo: null,
    selecao: "br",
    fixado: null,
    carga: 0, // muda a cada nova carga, para descartar respostas antigas
    municipiosTestados: false,
    municipiosIndisponiveis: false
};

const el = {
    titulo: document.getElementById("titulo"),
    status: document.getElementById("status"),
    placar: document.getElementById("placar"),
    uf: document.getElementById("uf"),
    atualizar: document.getElementById("atualizar"),
    carga: document.getElementById("carga"),
    cargaBarra: document.getElementById("carga-barra"),
    progresso: document.getElementById("progresso"),
    legenda: document.getElementById("legenda"),
    detalhe: document.getElementById("detalhe")
};

const LARGURA = 900;
const svg = d3.select("#mapa");
const gMun = svg.append("g").attr("id", "municipios");
const gUf = svg.append("g").attr("id", "limites-uf").attr("pointer-events", "none");
const gDestaque = svg.append("g").attr("id", "destaque").attr("pointer-events", "none");
let caminho = d3.geoPath();

// ---------- Leitura dos arquivos do TSE ----------

async function baixar(endereco, forcar = false) {
    const r = await fetch(endereco, { cache: forcar ? "no-cache" : "default", mode: "cors" });
    if (!r.ok) {
        const erro = new Error(`${r.status} em ${endereco}`);
        erro.status = r.status;
        throw erro;
    }
    return r.json();
}

const inteiro = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

// Transforma um arquivo "-u.json" (Brasil, UF ou município) no que o mapa usa
function lerResultado(json) {
    const cargo = (json.carg || []).find((c) => Number(c.cd) === CONFIG.cargo) || json.carg?.[0];
    const votos = {};
    for (const agr of cargo?.agr || []) {
        for (const par of agr.par || []) {
            for (const c of par.cand || []) votos[String(c.n)] = inteiro(c.vap);
        }
    }
    const s = json.s || {};
    const v = json.v || {};
    return {
        votos,
        // O TSE calcula o % sobre os válidos computados (vvc)
        validos: inteiro(v.vvc) ?? inteiro(v.vv),
        brancos: inteiro(v.vb),
        nulos: inteiro(v.tvn),
        secoes: inteiro(s.ts),
        totalizadas: inteiro(s.st),
        final: json.and === "f",
        geracao: { data: json.dg, hora: json.hg }
    };
}

// ---------- Cache no navegador ----------
// Só guarda municípios com apuração encerrada (and = "f"); o botão Atualizar ignora o cache.

function lerCache() {
    try {
        const bruto = localStorage.getItem(CONFIG.chaveCache);
        if (!bruto) return;
        for (const [cd, r] of Object.entries(JSON.parse(bruto))) estado.resultados.set(cd, r);
    } catch (e) { /* sem armazenamento: segue sem cache */ }
}

function gravarCache() {
    try {
        const finais = {};
        for (const [cd, r] of estado.resultados) if (r.final) finais[cd] = r;
        localStorage.setItem(CONFIG.chaveCache, JSON.stringify(finais));
    } catch (e) { /* cota cheia ou bloqueada: ignora */ }
}

// ---------- Cores ----------

function vencedor(res) {
    if (!res || !res.validos) return null;
    const [a, b] = CONFIG.candidatos;
    const va = res.votos[a.numero] ?? 0;
    const vb = res.votos[b.numero] ?? 0;
    if (va === vb) return { empate: true };
    const ganha = va > vb ? a : b;
    return { candidato: ganha, pct: (Math.max(va, vb) / res.validos) * 100 };
}

function cor(res) {
    const v = vencedor(res);
    if (!v) return CONFIG.corSemDado;
    if (v.empate) return CONFIG.corEmpate;
    let i = 0;
    for (let k = 0; k < CONFIG.faixas.length; k++) if (v.pct >= CONFIG.faixas[k]) i = k;
    return v.candidato.cores[i];
}

// ---------- Textos ----------

function dataTSE(g) {
    const d = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(g?.data || "");
    const h = /^(\d{2}):(\d{2})/.exec(g?.hora || "");
    if (!d || !h) return null;
    return `${Number(d[1])} de ${MESES[Number(d[2]) - 1]} de ${d[3]}, ${Number(h[1])}h${h[2]}`;
}

function pctSecoes(res) {
    if (!res?.secoes) return null;
    return (res.totalizadas / res.secoes) * 100;
}

function nomeRecorte(sel) {
    if (sel === "br") return "Brasil";
    return estado.ufs.find((u) => u.sigla === sel)?.nome ?? sel.toUpperCase();
}

function tituloCaso(txt) {
    const minusculas = new Set(["de", "da", "do", "das", "dos", "e"]);
    return txt.toLowerCase().split(" ").map((p, i) =>
        i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

// Barra com a divisão dos votos válidos entre os dois candidatos e marca em 50%
function barraDivisao(res, fina = false) {
    const [a, b] = CONFIG.candidatos;
    const pa = res?.validos ? (res.votos[a.numero] / res.validos) * 100 : 0;
    const pb = res?.validos ? (res.votos[b.numero] / res.validos) * 100 : 0;
    return `<div class="barra${fina ? " fina" : ""}" aria-hidden="true">` +
        `<span style="width:${pa}%;background:${a.cor}"></span>` +
        `<span style="width:${pb}%;background:${b.cor};margin-left:auto"></span>` +
        "<i class=\"meio\"></i></div>";
}

// ---------- Placar ----------

function desenharPlacar() {
    const res = estado.recortes.get(estado.selecao);
    if (!res) {
        el.placar.innerHTML = "";
        return;
    }
    const lados = CONFIG.candidatos.map((c) => {
        const votos = res.votos[c.numero];
        const pct = res.validos ? (votos / res.validos) * 100 : null;
        return `<div><span class="placar-nome">${c.nome}</span>` +
            `<span class="placar-pct" style="color:${c.cor}">${pct == null ? "" : fmtPct.format(pct) + "%"}</span>` +
            `<span class="placar-votos">${votos == null ? "" : fmtInt.format(votos) + " votos"}</span></div>`;
    });
    const sec = pctSecoes(res);
    const quando = dataTSE(res.geracao);
    const nota = `${nomeRecorte(estado.selecao)}: ` +
        (sec == null ? "seções totalizadas não informadas" : `${fmtPct.format(sec)}% das seções totalizadas`) +
        (quando ? `. Arquivo do TSE gerado em ${quando}.` : ".");
    el.placar.innerHTML = `<div class="placar-nomes">${lados.join("")}</div>` +
        barraDivisao(res) +
        "<div class=\"barra-rotulo\">50% dos válidos</div>" +
        `<p class="nota">${nota}</p>`;
}

// ---------- Título-afirmação ----------

function atualizarTitulo(completo) {
    const muns = municipiosDaSelecao();
    const nome = nomeRecorte(estado.selecao);
    const neutro = `Apuração do 2º turno por município: ${nome}`;
    if (!completo || !muns.length) {
        el.titulo.textContent = neutro;
        return;
    }
    const conta = new Map(CONFIG.candidatos.map((c) => [c.numero, 0]));
    let comDado = 0;
    let algumParcial = false;
    for (const m of muns) {
        const res = estado.resultados.get(m.cd);
        const v = vencedor(res);
        if (!v) continue;
        comDado++;
        if (!res.final) algumParcial = true;
        if (!v.empate) conta.set(v.candidato.numero, conta.get(v.candidato.numero) + 1);
    }
    if (!comDado) {
        el.titulo.textContent = neutro;
        return;
    }
    const [lider] = [...CONFIG.candidatos].sort((a, b) => conta.get(b.numero) - conta.get(a.numero));
    const verbo = algumParcial ? "lidera" : "vence";
    const onde = estado.selecao === "br" ? "do país" : `de ${nome}`;
    el.titulo.textContent = `${lider.nome} ${verbo} em ${fmtInt.format(conta.get(lider.numero))} dos ${fmtInt.format(muns.length)} municípios ${onde}`;
}

// ---------- Legenda ----------

function desenharLegenda() {
    const [a, b] = CONFIG.candidatos;
    // Escala divergente: vitória folgada de um lado, vitória folgada do outro
    const blocos = [...a.cores].reverse().concat(b.cores);
    const marcas = ["70", "60", "55", "50", "55", "60", "70"];
    el.legenda.innerHTML =
        "<p class=\"legenda-titulo\">Vencedor no município e % dos votos válidos</p>" +
        `<div class="legenda-nomes"><span style="color:${a.cor}">${a.nome}</span><span style="color:${b.cor}">${b.nome}</span></div>` +
        `<div class="legenda-escala">${blocos.map((c) => `<span style="background:${c}"></span>`).join("")}</div>` +
        `<div class="legenda-marcas">${marcas.map((m, i) => `<span style="left:${((i + 1) / 8) * 100}%">${m}</span>`).join("")}</div>` +
        "<div class=\"legenda-extra\">" +
        `<span class="legenda-item"><i style="background:${CONFIG.corEmpate}"></i>Empate</span>` +
        `<span class="legenda-item"><i style="background:${CONFIG.corSemDado}"></i>Sem resultado ainda</span>` +
        "</div>";
}

// ---------- Detalhe do município ----------

function mostrarDetalhe(feicao) {
    const p = feicao.properties;
    const cd = estado.tsePorIbge.get(String(p.id));
    const res = cd ? estado.resultados.get(cd) : null;
    let html = `<h2>${p.nome} (${p.uf})</h2>`;
    if (!res) {
        html += `<p class="nota">${cd ? "Resultado ainda não carregado." : "Município sem correspondência na lista do TSE."}</p>`;
        el.detalhe.innerHTML = html;
        return;
    }
    html += barraDivisao(res, true);
    html += "<table><tbody>";
    for (const c of CONFIG.candidatos) {
        const votos = res.votos[c.numero];
        const pct = res.validos ? (votos / res.validos) * 100 : null;
        html += `<tr><td><span class="marca" style="background:${c.cor}"></span>${c.nome}</td>` +
            `<td class="num">${votos == null ? "" : fmtInt.format(votos)}</td>` +
            `<td class="num"><strong>${pct == null ? "" : fmtPct.format(pct) + "%"}</strong></td></tr>`;
    }
    html += "</tbody></table>";
    const sec = pctSecoes(res);
    const linhas = [];
    if (sec != null) linhas.push(`${fmtPct.format(sec)}% das seções totalizadas`);
    if (res.brancos != null) linhas.push(`${fmtInt.format(res.brancos)} votos em branco`);
    if (res.nulos != null) linhas.push(`${fmtInt.format(res.nulos)} votos nulos`);
    html += linhas.map((l) => `<p class="nota">${l}</p>`).join("");
    el.detalhe.innerHTML = html;
}

function destacar(feicao) {
    gDestaque.selectAll("path").data(feicao ? [feicao] : []).join("path")
        .attr("d", caminho)
        .attr("fill", "none")
        .attr("stroke", "#000000")
        .attr("stroke-width", 2)
        .attr("vector-effect", "non-scaling-stroke");
}

// ---------- Mapa ----------

function municipiosDaSelecao() {
    if (estado.selecao === "br") return estado.ufs.flatMap((u) => u.municipios);
    return estado.ufs.find((u) => u.sigla === estado.selecao)?.municipios ?? [];
}

function feicoesDaSelecao() {
    if (estado.selecao === "br") return estado.feicoes;
    const sigla = estado.selecao.toUpperCase();
    return estado.feicoes.filter((f) => f.properties.uf === sigla);
}

function corFeicao(f) {
    const cd = estado.tsePorIbge.get(String(f.properties.id));
    return cor(cd ? estado.resultados.get(cd) : null);
}

function desenharMapa() {
    const feicoes = feicoesDaSelecao();
    const colecao = { type: "FeatureCollection", features: feicoes };
    const projecao = d3.geoMercator().fitWidth(LARGURA, colecao);
    caminho = d3.geoPath(projecao);
    const [[, y0], [, y1]] = caminho.bounds(colecao);
    projecao.translate([projecao.translate()[0], projecao.translate()[1] - y0]);
    svg.attr("viewBox", `0 0 ${LARGURA} ${Math.ceil(y1 - y0)}`);

    const brasil = estado.selecao === "br";
    // fill e stroke como atributos: o SVG abre limpo no Illustrator.
    // No Brasil inteiro o contorno de município tem a cor do próprio polígono, para o mapa não virar textura.
    gMun.selectAll("path").data(feicoes, (f) => f.properties.id).join("path")
        .attr("class", "mun")
        .attr("id", (f) => `m${f.properties.id}`)
        .attr("d", caminho)
        .attr("fill", corFeicao)
        .attr("stroke", brasil ? corFeicao : "#ffffff")
        .attr("stroke-width", brasil ? 0.3 : 0.6)
        .on("pointerenter", (ev, f) => {
            if (estado.fixado) return;
            destacar(f);
            mostrarDetalhe(f);
        })
        .on("click", (ev, f) => {
            estado.fixado = estado.fixado === f ? null : f;
            destacar(estado.fixado || f);
            mostrarDetalhe(f);
        });

    const limites = brasil
        ? topojson.mesh(estado.topo, estado.topo.objects.ufs)
        : estado.ufsGeo.find((u) => u.properties.uf === estado.selecao.toUpperCase());
    gUf.selectAll("path").data(limites ? [limites] : []).join("path")
        .attr("d", caminho)
        .attr("fill", "none")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", brasil ? 1.2 : 2)
        .attr("stroke-linejoin", "round");

    destacar(null);
}

function recolorir() {
    const brasil = estado.selecao === "br";
    const paths = gMun.selectAll("path").attr("fill", corFeicao);
    if (brasil) paths.attr("stroke", corFeicao);
}

// ---------- Carga dos municípios ----------

async function emFila(itens, tarefa, aoProgredir) {
    let i = 0;
    let feitos = 0;
    let falhasSeguidas = 0;
    let abortar = null;
    const trabalhador = async () => {
        while (i < itens.length && !abortar) {
            const item = itens[i++];
            try {
                await tarefa(item);
                falhasSeguidas = 0;
            } catch (e) {
                falhasSeguidas++;
                if (falhasSeguidas >= CONFIG.maxFalhasSeguidas) abortar = e;
            }
            feitos++;
            aoProgredir(feitos);
        }
    };
    await Promise.all(Array.from({ length: CONFIG.paralelo }, trabalhador));
    if (abortar) throw abortar;
}

function mostrarProgresso(feitos, total) {
    el.carga.hidden = false;
    el.cargaBarra.style.width = `${(feitos / total) * 100}%`;
    el.progresso.textContent = `Lendo municípios no TSE: ${fmtInt.format(feitos)} de ${fmtInt.format(total)}`;
}

async function carregarSelecao(forcar = false) {
    const carga = ++estado.carga;
    const sel = estado.selecao;
    el.atualizar.disabled = true;

    // Placar do recorte (arquivo do Brasil ou da UF)
    try {
        if (forcar || !estado.recortes.has(sel)) estado.recortes.set(sel, lerResultado(await baixar(url.recorte(sel), forcar)));
    } catch (e) {
        mostrarErro(`Não foi possível ler o total de ${nomeRecorte(sel)} no TSE (${e.message}).`);
    }
    if (carga !== estado.carga) return;
    desenharPlacar();

    if (estado.municipiosIndisponiveis) {
        el.atualizar.disabled = false;
        return;
    }

    const ufs = sel === "br" ? estado.ufs : estado.ufs.filter((u) => u.sigla === sel);
    const pendentes = ufs.flatMap((u) => u.municipios.map((m) => ({ uf: u.sigla, ...m })))
        .filter((m) => forcar || !estado.resultados.get(m.cd)?.final);

    // Testa um arquivo antes de pedir centenas: 404 em série bloqueia o IP no TSE
    if (pendentes.length && !estado.municipiosTestados) {
        try {
            const m = pendentes[0];
            estado.resultados.set(m.cd, lerResultado(await baixar(url.municipio(m.uf, m.cd), forcar)));
            estado.municipiosTestados = true;
            pendentes.shift();
        } catch (e) {
            estado.municipiosIndisponiveis = true;
            mostrarErro(`O TSE não entregou o arquivo por município (${e.message}). O placar acima continua válido; o mapa fica sem cor.`);
            el.atualizar.disabled = false;
            return;
        }
    }

    const total = pendentes.length;
    let ultimoDesenho = 0;
    if (total) mostrarProgresso(0, total);
    try {
        await emFila(pendentes, async (m) => {
            const res = lerResultado(await baixar(url.municipio(m.uf, m.cd), forcar));
            if (carga === estado.carga) estado.resultados.set(m.cd, res);
        }, (feitos) => {
            if (carga !== estado.carga) return;
            mostrarProgresso(feitos, total);
            const agora = performance.now();
            if (agora - ultimoDesenho > 500) {
                ultimoDesenho = agora;
                recolorir();
            }
        });
    } catch (e) {
        mostrarErro(`A leitura parou depois de várias falhas seguidas no TSE (${e.message}). Tente atualizar em alguns minutos.`);
    }
    if (carga !== estado.carga) return;

    recolorir();
    gravarCache();
    el.carga.hidden = true;
    el.progresso.textContent = "";
    const faltando = municipiosDaSelecao().filter((m) => !estado.resultados.has(m.cd)).length;
    if (faltando) {
        el.carga.hidden = false;
        el.cargaBarra.style.width = "0";
        el.progresso.textContent = `${fmtInt.format(faltando)} municípios ficaram sem resultado nesta leitura.`;
    }
    atualizarTitulo(true);
    if (estado.fixado) mostrarDetalhe(estado.fixado);
    el.atualizar.disabled = false;
}

function mostrarErro(msg) {
    el.status.textContent = msg;
    el.status.classList.add("erro");
}

// ---------- Início ----------

async function iniciar() {
    desenharLegenda();
    lerCache();
    try {
        // Tudo o que não depende de nada é pedido ao mesmo tempo
        const pCfg = baixar(url.config(), true);
        const pMun = baixar(url.municipios());
        const pTopo = d3.json("geo/municipios.topojson");
        const pBr = baixar(url.recorte("br"), true).then(lerResultado).catch(() => null);

        const cfg = await pCfg;
        const existe = (cfg.pl || []).some((p) => p.c === CONFIG.ciclo &&
            (p.e || []).some((e) => String(e.cd) === CONFIG.eleicao));
        if (!existe) {
            mostrarErro(`A configuração do TSE ainda não lista a eleição ${CONFIG.eleicao} (2º turno).`);
            return;
        }

        const br = await pBr;
        if (br) {
            estado.recortes.set("br", br);
            desenharPlacar();
        }

        const [mun, topo] = await Promise.all([pMun, pTopo]);

        for (const abr of mun.abr || []) {
            const sigla = String(abr.cd).toLowerCase();
            if (sigla === "zz") continue; // exterior
            const municipios = (abr.mu || []).map((m) => ({ cd: String(m.cd), cdi: String(m.cdi), nm: m.nm }));
            for (const m of municipios) estado.tsePorIbge.set(m.cdi, m.cd);
            estado.ufs.push({ sigla, nome: tituloCaso(abr.ds || sigla), municipios });
        }
        estado.ufs.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        for (const u of estado.ufs) el.uf.add(new Option(u.nome, u.sigla));

        estado.topo = topo;
        estado.feicoes = topojson.feature(topo, topo.objects.municipios).features;
        estado.ufsGeo = topojson.feature(topo, topo.objects.ufs).features
            .map((f) => ({ ...f, properties: { uf: f.properties.uf } }));

        const comPoligono = new Set(estado.feicoes.map((f) => String(f.properties.id)));
        const semPoligono = estado.ufs.flatMap((u) => u.municipios).filter((m) => !comPoligono.has(m.cdi));
        el.status.textContent = "Dados oficiais do TSE." +
            (semPoligono.length ? ` ${semPoligono.length === 1 ? "Um município" : semPoligono.length + " municípios"} da lista do TSE sem polígono na malha: ${semPoligono.map((m) => tituloCaso(m.nm)).join(", ")}.` : "");

        desenharMapa();
        await carregarSelecao();
    } catch (e) {
        mostrarErro(`Não foi possível carregar os dados (${e.message}).`);
        console.error(e);
    }
}

el.uf.addEventListener("change", () => {
    estado.selecao = el.uf.value;
    estado.fixado = null;
    el.detalhe.innerHTML = "<p class=\"nota\">Passe o cursor ou toque num município para ver o resultado.</p>";
    atualizarTitulo(false);
    desenharMapa();
    carregarSelecao();
});

el.atualizar.addEventListener("click", () => carregarSelecao(true));

svg.on("pointerleave", () => {
    if (!estado.fixado) destacar(null);
});

iniciar();
