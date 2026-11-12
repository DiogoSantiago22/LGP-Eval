// Índices faciais do modelo de Pose do MediaPipe (33 pontos, sempre disponíveis sem custo extra)
// Nariz(0), Ouvido Esq(7), Ouvido Dir(8), Boca Esq(9), Boca Dir(10)
// Usados para calcular a distância relativa da mão à face no FastDTW dinâmico.
const POSE_FACE_INDICES = [0, 7, 8, 9, 10];

//#my_code: calcula o ângulo em graus entre três pontos (p2 é o vértice/dobra)
function calcularAngulo(p1, p2, p3) {
    const radianos = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angulo = Math.abs(radianos * 180.0 / Math.PI);

    if (angulo > 180.0) {
        angulo = 360.0 - angulo;
    }
    return angulo;
}

//my_code: comparação da mão atual (seja esquerda ou direita) com a BASE_DADOS_REFERENCIAS agora com a parte do corpo tbm
function classificarGestoPorReferencia(landmarksAtuais, labelMao, poseLandmarks, larguraVideo, alturaVideo, gestoAlvo = null) {
    if (BASE_DADOS_REFERENCIAS.length === 0) return { reconhecido: null, erro: 0, todosResultados: [] };

    const maoNormalizada = normalizarLandmarks(landmarksAtuais, larguraVideo, alturaVideo);
    let maoTeste = maoNormalizada;

    if (labelMao === "Left") {
        maoTeste = maoNormalizada.map(ponto => ({ x: -ponto.x, y: ponto.y, z: ponto.z }));
    }

    // Identificar em que caixa (Bounding Box) a mão está agora
    const zonaAtual = identificarZonaArticulacao(landmarksAtuais, poseLandmarks);

    const referenciasParaComparar = BASE_DADOS_REFERENCIAS.filter(ref => {
        if (!gestoAlvo) return true;
        return ref.nome === gestoAlvo || ref.nome.startsWith(gestoAlvo + "_V");
    });

    if (referenciasParaComparar.length === 0) return { reconhecido: null, erro: 1.0, todosResultados: [] };

    let melhorGesto = null;
    let menorErroFinal = Infinity;
    let resultadosParciais = [];

    let debugAnguloIdeal = 0, debugAnguloAtual = 0, debugDiffAngulo = 0, debugErroMaximoPonto = 0, debugIndicePontoErrado = -1;
    let anguloVencedorReprovado = false;
    let debugZonaAtual = "", debugZonaAlvo = "";

    const LIMITE_ACEITACAO_MEDIO = 0.25; // Aumentei um pouco a tolerância dos dedos porque a penalidade de zona agora é fixa
    const LIMITE_CRITICO_PONTO = 0.42;
    const TOLERANCIA_RADIANOS = 50 * (Math.PI / 180);

    for (const referencia of referenciasParaComparar) {
        const anguloReferencia = Math.atan2(referencia.pontos[9].y, referencia.pontos[9].x);
        const anguloTeste = Math.atan2(maoTeste[9].y, maoTeste[9].x);

        let diffAngulo = anguloReferencia - anguloTeste;
        diffAngulo = Math.atan2(Math.sin(diffAngulo), Math.cos(diffAngulo));

        let chumbouNoAngulo = Math.abs(diffAngulo) > TOLERANCIA_RADIANOS;
        const cosA = Math.cos(diffAngulo); const sinA = Math.sin(diffAngulo);

        let erroTotalMao = 0, erroMaximoNestaRef = 0, indicePontoPiorNestaRef = -1;

        for (let i = 0; i < 21; i++) {
            const xRodado = maoTeste[i].x * cosA - maoTeste[i].y * sinA;
            const yRodado = maoTeste[i].x * sinA + maoTeste[i].y * cosA;

            const distx = xRodado - referencia.pontos[i].x;
            const disty = yRodado - referencia.pontos[i].y;
            // O eixo Z é mantido intacto como me pediste!
            const distanciaPonto = Math.sqrt(distx * distx + disty * disty);

            erroTotalMao += distanciaPonto;
            if (distanciaPonto > erroMaximoNestaRef) {
                erroMaximoNestaRef = distanciaPonto;
                indicePontoPiorNestaRef = i;
            }
        }

        let erroFinal = erroTotalMao / 21;

        // CALCULAR A ZONA ALVO EM TEMPO REAL PELO JSON
        let zonaAlvo = "DESCONHECIDA";
        if (referencia.corpo) {
            zonaAlvo = calcularZonaDinamica(
                referencia.corpo.ancoraMao.x, referencia.corpo.ancoraMao.y,
                referencia.corpo.nariz.y,
                referencia.corpo.ombroEsq.x, referencia.corpo.ombroEsq.y,
                referencia.corpo.ombroDir.x, referencia.corpo.ombroDir.y
            );
        }

        // PENALIZAÇÃO POR ZONA ERRADA
        if (zonaAlvo !== "DESCONHECIDA" && zonaAtual !== "DESCONHECIDA") {
            if (zonaAlvo !== zonaAtual) {
                erroFinal += 0.30;
            }
        }

        if (chumbouNoAngulo) {
            resultadosParciais.push({ nome: referencia.nome, erro: 1.0, motivo: "Ângulo" });
        } else {
            resultadosParciais.push({ nome: referencia.nome, erro: erroFinal, erroMax: erroMaximoNestaRef });
        }

        if (erroFinal < menorErroFinal) {
            menorErroFinal = erroFinal;
            melhorGesto = referencia.nome;
            debugErroMaximoPonto = erroMaximoNestaRef;
            debugIndicePontoErrado = indicePontoPiorNestaRef;
            anguloVencedorReprovado = chumbouNoAngulo;
            debugZonaAtual = zonaAtual;
            debugZonaAlvo = zonaAlvo; // A variável dinâmica preenchida!

            let ideal = Math.atan2(-referencia.pontos[9].y, -referencia.pontos[9].x) * (180 / Math.PI);
            let atual = Math.atan2(-maoTeste[9].y, -maoTeste[9].x) * (180 / Math.PI);
            if (ideal < 0) ideal += 360; if (atual < 0) atual += 360;
            if (ideal === 360) ideal = 0; if (atual === 360) atual = 0;

            debugAnguloIdeal = ideal; debugAnguloAtual = atual;
        }
    }

    const pacoteResultado = {
        reconhecido: null, erro: menorErroFinal, todosResultados: resultadosParciais,
        debug: {
            anguloIdeal: debugAnguloIdeal.toFixed(1), anguloAtual: debugAnguloAtual.toFixed(1),
            erroMaximo: debugErroMaximoPonto.toFixed(3), nomePontoErrado: obterNomeDoPonto(debugIndicePontoErrado),
            zonaAtual: debugZonaAtual, zonaAlvo: debugZonaAlvo // Passado para a UI
        }
    };

    if (menorErroFinal < LIMITE_ACEITACAO_MEDIO && debugErroMaximoPonto < LIMITE_CRITICO_PONTO && !anguloVencedorReprovado && melhorGesto !== null) {
        pacoteResultado.reconhecido = melhorGesto;
    }

    return pacoteResultado;
}

function obterNomeDoPonto(indice) {
    if (indice === 0) return "Pulso";
    if (indice >= 1 && indice <= 4) return "Polegar";
    if (indice >= 5 && indice <= 8) return "Dedo Indicador";
    if (indice >= 9 && indice <= 12) return "Dedo Médio";
    if (indice >= 13 && indice <= 16) return "Dedo Anelar";
    if (indice >= 17 && indice <= 20) return "Dedo Mindinho";
    return "Dedo";
}

/**
 * my_code:
 * DTW com Sakoe-Chiba Band.
 * Compara duas sequências de frames enriquecidas { mao, zona, corpo, distRelFace }.
 *
 * A banda (w) restringe o caminho de alinhamento a uma faixa diagonal,
 * passando de O(N²) para O(N·w). Impede alinhamentos patológicos
 * (ex: mapear 2 frames do utilizador com todos os 45 do molde).
 *
 * @param {Array}  seqUtilizador  Sequência capturada em tempo real
 * @param {Array}  seqMolde       Sequência do ficheiro JSON de referência
 * @param {number} w              Largura da banda (default: 10 ≈ 333ms a 30fps)
 * @returns {number} Custo médio normalizado do percurso ótimo
 */
function calcularDTW(seqUtilizador, seqMolde, w = 10) {
    const N = seqUtilizador.length; //linhas
    const M = seqMolde.length; //colunas

    // A banda nunca pode ser menor que |N-M| — garante que existe caminho válido
    const banda = Math.max(w, Math.abs(N - M));

    //Matriz de Custos bidimensional
    const dtw = Array(N + 1).fill(null).map(() => Array(M + 1).fill(Infinity));
    dtw[0][0] = 0;

    for (let i = 1; i <= N; i++) {
        // Limites j dentro da banda de Sakoe-Chiba
        const jMin = Math.max(1, i - banda);
        const jMax = Math.min(M, i + banda);

        for (let j = jMin; j <= jMax; j++) {
            const custo = calcularCustoEntreDuasFrames(
                seqUtilizador[i - 1],
                seqMolde[j - 1]
            );
            dtw[i][j] = custo + Math.min(
                dtw[i - 1][j],       // Utilizador mais rápido (ignora frame do utilizador)
                dtw[i][j - 1],       // Utilizador mais lento (ignora frame do molde)
                dtw[i - 1][j - 1]    // Sincronia perfeita
            );
        }
    }

    // Normalizar pelo tamanho total do percurso para valores comparáveis entre sequências
    return dtw[N][M] / (N + M);
}

/**
 * Calcula as 5 distâncias relativas do pulso da mão a cada ponto facial do modelo de Pose.
 * Usa exclusivamente landmarks do Pose (nariz, ouvidos, boca) que já são calculados
 * pelo MediaPipe Holistic sem nenhum custo adicional de performance.
 *
 * @param {number} pulsoX        Coordenada X do pulso (landmark 0 da mão, raw/normalizado)
 * @param {number} pulsoY        Coordenada Y do pulso
 * @param {Array}  poseLandmarks Array de 33 landmarks do corpo (results.poseLandmarks)
 * @param {string} labelMao      "Right" | "Left"
 * @returns {number[]|null} Array de 5 distâncias [0, +inf], ou null se pose indisponível
 */
function calcularDistRelFace(pulsoX, pulsoY, poseLandmarks, labelMao) {
    if (!poseLandmarks || poseLandmarks.length === 0) return null;

    const dists = POSE_FACE_INDICES.map(idx => {
        const pt = poseLandmarks[idx];
        if (!pt) return 0;
        const dx = pulsoX - pt.x;
        const dy = pulsoY - pt.y;
        return Math.sqrt(dx * dx + dy * dy);
    });

    // Se for a mão esquerda, espelhamos simetricamente as distâncias laterais da face
    // para baterem certo com os moldes gravados com a mão direita.
    // Índices do vetor dists: 0=Nariz, 1=OuvidoEsq, 2=OuvidoDir, 3=BocaEsq, 4=BocaDir
    if (labelMao === 'Left') {
        // Trocar orelha esquerda com orelha direita
        const tempOuvido = dists[1];
        dists[1] = dists[2];
        dists[2] = tempOuvido;

        // Trocar canto esquerdo da boca com canto direito
        const tempBoca = dists[3];
        dists[3] = dists[4];
        dists[4] = tempBoca;
    }

    return dists;
}

/**
 * Calcula o custo de dissimilaridade entre dois instantes de uma sequência gestual.
 * Cada frame = { mao: [...21 pts], zona: "PEITO", corpo: {...}, distRelFace: [...5] }
 *
 * Custo total = erro_geométrico_médio + penalização_zona + erro_facial_relativo
 *
 * @param {Object} frameUtilizador  Frame capturada em tempo real
 * @param {Object} frameMolde       Frame do ficheiro JSON de referência
 * @returns {number} Custo de dissimilaridade [0, +inf]
 */
function calcularCustoEntreDuasFrames(frameUtilizador, frameMolde) {
    // 1. ERRO GEOMÉTRICO: distância euclidiana média dos 21 pontos da mão
    const pontosU = frameUtilizador.mao;
    const pontosM = frameMolde.mao;
    let erroGeometrico = 0;
    for (let i = 0; i < 21; i++) {
        const dx = pontosU[i].x - pontosM[i].x;
        const dy = pontosU[i].y - pontosM[i].y;
        erroGeometrico += Math.sqrt(dx * dx + dy * dy);
    }
    erroGeometrico /= 21;

    // 2. PENALIZAÇÃO POR ZONA
    let penalizacaoZona = 0;
    const zonaUtilizador = frameUtilizador.zona;
    if (zonaUtilizador && zonaUtilizador !== "DESCONHECIDA" && frameMolde.corpo) {
        const c = frameMolde.corpo;
        const zonaMolde = calcularZonaDinamica(
            c.ancoraMao.x, c.ancoraMao.y,
            c.nariz.y,
            c.ombroEsq.x, c.ombroEsq.y,
            c.ombroDir.x, c.ombroDir.y
        );
        if (zonaMolde !== "DESCONHECIDA" && zonaUtilizador !== zonaMolde) {
            penalizacaoZona = 1.20; // Penalização MASSIVA: garante que a média (N+M) exceda o limite de 0.25
        }
    }

    // 3. ERRO DE DISTÂNCIA FACIAL RELATIVA
    // Compara as 5 distâncias pulso→pontos-faciais-de-pose entre utilizador e molde.
    let erroFacial = 0;
    const dU = frameUtilizador.distRelFace;
    const dM = frameMolde.distRelFace;
    if (dU && dM && dU.length === dM.length) {
        let soma = 0;
        for (let i = 0; i < dU.length; i++) {
            soma += Math.abs(dU[i] - dM[i]);
        }
        erroFacial = (soma / dU.length) * 1.5; // Multiplicador de rigidez para reprovar distâncias longas
    }

    return erroGeometrico + penalizacaoZona + erroFacial;
}

// my_code: Pode calcular o tempo real ou os dados do JSON
function calcularZonaDinamica(pontoAncoraX, pontoAncoraY, narizY, ombroEsqX, ombroEsqY, ombroDirX, ombroDirY) {
    if (!narizY || !ombroEsqY || !ombroDirY) return "DESCONHECIDA";

    // HORIZONTAL
    const centroX = (ombroEsqX + ombroDirX) / 2;
    const larguraOmbros = Math.abs(ombroEsqX - ombroDirX);
    const metadeLarguraCaixa = (larguraOmbros * 1.8) / 2;

    if (pontoAncoraX < (centroX - metadeLarguraCaixa) || pontoAncoraX > (centroX + metadeLarguraCaixa)) {
        return "FORA";
    }

    // VERTICAL
    const linhaOmbrosY = (ombroEsqY + ombroDirY) / 2;

    // CORREÇÃO: Previne o colapso das caixas se o utilizador baixar a cabeça
    const distanciaNarizOmbros = Math.abs(linhaOmbrosY - narizY);
    const tamanhoCabecaPescoco = Math.max(distanciaNarizOmbros, larguraOmbros * 0.45);

    const linhaFimPeitoY = linhaOmbrosY + (tamanhoCabecaPescoco * 1.5);
    const topoCabecaY = Math.max(0, narizY - (tamanhoCabecaPescoco * 1.2));
    const fimAbdomenY = linhaFimPeitoY + (tamanhoCabecaPescoco * 1.5);

    if (pontoAncoraY < topoCabecaY || pontoAncoraY > fimAbdomenY) { return "FORA"; }

    if (pontoAncoraY < narizY) { return "TESTA"; }
    else if (pontoAncoraY >= narizY && pontoAncoraY < linhaOmbrosY) { return "QUEIXO"; }
    else if (pontoAncoraY >= linhaOmbrosY && pontoAncoraY < linhaFimPeitoY) { return "PEITO"; }
    else { return "ABDOMEN"; }
}

// PARA A CÂMARA EM TEMPO REAL
function identificarZonaArticulacao(maoLandmarksRaw, poseLandmarks) {
    if (!poseLandmarks || !maoLandmarksRaw) return "DESCONHECIDA";

    return calcularZonaDinamica(
        maoLandmarksRaw[0].x, maoLandmarksRaw[0].y,
        poseLandmarks[0].y,
        poseLandmarks[11].x, poseLandmarks[11].y,
        poseLandmarks[12].x, poseLandmarks[12].y
    );
}

