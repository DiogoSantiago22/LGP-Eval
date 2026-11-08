// =========================================================================
// 1. CONFIGURAÇÕES E INICIALIZAÇÃO DE MOTORES
// =========================================================================

const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusText = document.getElementById('status');

// Configurar o motor HOLISTIC (Corpo + Mãos integrados)
const holistic = new Holistic({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
    }
});

holistic.setOptions({
    modelComplexity: 1, //0 = Rápido/Impreciso, 1 = Equilibrado, 2 = Pesado/Preciso
    smoothLandmarks: true,
    enableSegmentation: false, //nao precisamos de recortar o fundo (gasta CPU)
    refineFaceLandmarks: false, //desliga os 468 pontos da cara para não matar a latência!
    minDetectionConfidence: 0.76,//limite de exigência (de 0.0 a 1.0) para a deteção inicial da mão, ao que neste momento é se 85% de certeza absoluta que a distorção de pixeis é uma mão humana
    minTrackingConfidence: 0.8
});

// Vê o momento exato em que a câmara descobre a sua própria resolução
videoElement.addEventListener('loadedmetadata', () => {
    //Obrigamos o Canvas (onde desenhamos os pontos) a ter a resolução real
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    console.log(`[SISTEMA] Câmara e Canvas sincronizados a: ${canvasElement.width}x${canvasElement.height}`);
});

// Deixa o browser decidir a resolução nativa ótima.
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await holistic.send({ image: videoElement });
    }
});
camera.start();


// =========================================================================
// 2. ESTADO GLOBAL DA APLICAÇÃO
// =========================================================================

let ultimaMaoDetetada = null;
let ultimaLabelMao = null; // Saber se é dir/esq para a gravação
let ultimaPoseDetetada = null; // Memória do corpo
let estadoApp = null;
// Variável global para sabermos o que o sistema está a procurar
let gestoAlvo = "Numero_1";
// Variáveis de Telemetria (Performance)
let ultimoTempo = performance.now();
let contadorFrames = 0;
let fpsAtuais = 0;

let ultimoPulsoCru = { 'Right': null, 'Left': null }; // Mantido para compatibilidade (não usado no DTW)


// #my_code: Máquina de Estados: Segmentação Híbrida Adaptativa ---
// Estado de cada mão: 'REPOUSO' | 'GRAVANDO' | 'DEBOUNCE'
let estadoSegmentacao = { 'Right': 'REPOUSO', 'Left': 'REPOUSO' };
let timerDebounce = { 'Right': null, 'Left': null };
const DEBOUNCE_MS = 400; // ms de espera após repouso antes de disparar FastDTW

// Prioridade de mão: apenas 1 mão ativa o DTW de cada vez (gestos unimanual)
let maoAtivaDTW = null; // 'Right' | 'Left' | null

// --- Gravação dinâmica com contagem decrescente (Tecla R) ---
let contadorRegressivo = 0;  // 0 = inativo; >0 = a contar
let timerContagem = null;    // referência ao setInterval da contagem

// --- Variáveis Globais para a Gravação DTW ---
let aGravarDinamico = false;
let bufferGravacao = [];
let nomeGestoGravacao = "";

let TAMANHO_MAX_BUFFER = 150; // Equivale a cerca de 5 segundos a 30fps (gestos lentos)
let bufferMaoDireita = []; // memória temporal
let bufferMaoEsquerda = [];

// Carregar memória ou pedir calibração
inicializarCalibracao();


// =========================================================================
// 3. CORE LOOP PRINCIPAL (MediaPipe Holistic Events)
// =========================================================================

holistic.onResults((results) => {
    // Cálculo / FPS
    const tempoAtual = performance.now();
    contadorFrames++;
    if (tempoAtual - ultimoTempo >= 1000) {
        fpsAtuais = contadorFrames;
        console.log(`[TELEMETRIA] Motor Holístico a rodar a: ${fpsAtuais} FPS`);
        contadorFrames = 0;
        ultimoTempo = tempoAtual;
    }

    const maoDireita = results.rightHandLandmarks;
    const maoEsquerda = results.leftHandLandmarks;
    const poseCorpo = results.poseLandmarks;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    let statusDireita = "";
    let statusEsquerda = "";

    let maoParaFantasma = null;
    if (maoEsquerda && !maoDireita) {
        maoParaFantasma = 'Left';
    } else if (maoDireita && !maoEsquerda) {
        maoParaFantasma = 'Right';
    }

    // LER O BOTAO DAS DEFINICOES
    const mostrarFantasma = document.getElementById('toggle-fantasma') ? document.getElementById('toggle-fantasma').checked : true;
    const mostrarZonas = document.getElementById('toggle-zonas') ? document.getElementById('toggle-zonas').checked : true;

    // desenha o esqueleto da mao fantasma apenas se a opção estiver ativada
    if (estadoApp === "AVALIACAO" && gestoAlvo !== null && maoParaFantasma !== null && mostrarFantasma) {
        desenharEsqueletoFantasma(canvasCtx, canvasElement.width, canvasElement.height, gestoAlvo, maoParaFantasma);
    }

    // desenho do corpo na camada acima
    if (poseCorpo) {
        ultimaPoseDetetada = poseCorpo; // Guardar memória do corpo

        // Desenha as Bounding Boxes de Debug ANTES do esqueleto do corpo (para ficarem no fundo)
        if (mostrarZonas) {
            desenharZonasArticulacao(canvasCtx, poseCorpo, canvasElement.width, canvasElement.height);
        }

        drawConnectors(canvasCtx, poseCorpo, POSE_CONNECTIONS, { color: '#808080', lineWidth: 2 });
        drawLandmarks(canvasCtx, poseCorpo, { color: '#808080', lineWidth: 1 });
    } else {
        ultimaPoseDetetada = null;
    }

    // Processar a mão direita
    if (maoDireita) {
        ultimaMaoDetetada = maoDireita;
        ultimaLabelMao = 'Right';
        statusDireita = processarMaoUnificada(canvasCtx, maoDireita, 'Right', poseCorpo, '#00FF00');
    } else {
        // MÃO DIREITA NÃO DETETADA (utilizador sentado: mão no colo)
        if ((estadoApp === "AVALIACAO_DINAMICA" || estadoApp === "GRAVACAO_DINAMICA") && estadoSegmentacao['Right'] === 'GRAVANDO') {
            // Transição GRAVANDO → DEBOUNCE: aguardar antes de avaliar
            estadoSegmentacao['Right'] = 'DEBOUNCE';
            if (!timerDebounce['Right']) {
                timerDebounce['Right'] = setTimeout(() => { dispararAvaliacaoDTW('Right'); }, DEBOUNCE_MS);
            }
        } else if (estadoApp !== "AVALIACAO_DINAMICA" && estadoApp !== "GRAVACAO_DINAMICA") {
            bufferMaoDireita = []; // Limpar normalmente nos outros modos
        }
    }

    // Processar a mão esquerda
    if (maoEsquerda) {
        if (!maoDireita) {
            ultimaMaoDetetada = maoEsquerda;
            ultimaLabelMao = 'Left';
        }
        statusEsquerda = processarMaoUnificada(canvasCtx, maoEsquerda, 'Left', poseCorpo, '#00BFFF');
    } else {
        // MÃO ESQUERDA NÃO DETETADA (utilizador sentado: mão no colo)
        if ((estadoApp === "AVALIACAO_DINAMICA" || estadoApp === "GRAVACAO_DINAMICA") && estadoSegmentacao['Left'] === 'GRAVANDO') {
            estadoSegmentacao['Left'] = 'DEBOUNCE';
            if (!timerDebounce['Left']) {
                timerDebounce['Left'] = setTimeout(() => { dispararAvaliacaoDTW('Left'); }, DEBOUNCE_MS);
            }
        } else if (estadoApp !== "AVALIACAO_DINAMICA" && estadoApp !== "GRAVACAO_DINAMICA") {
            bufferMaoEsquerda = [];
        }
    }

    // Atualiza interface
    if (estadoApp === "CALIBRACAO") {
        if (maoDireita || maoEsquerda) {
            const maoPrincipal = maoDireita || maoEsquerda;
            const label = maoDireita ? 'Right' : 'Left';
            executarCalibracaoUI(maoPrincipal, label, canvasCtx, canvasElement.width, canvasElement.height);
        } else {
            desenharCaixaEspera(canvasCtx, canvasElement.width, canvasElement.height);
            statusText.innerText = "Coloque a mão na caixa para calibrar...";
        }
    }
    else if (estadoApp === "AVALIACAO") {
        if (statusDireita || statusEsquerda) {
            if (gestoAlvo !== null) {
                statusText.innerText = "";
            } else {
                statusText.innerText = `${statusDireita} ${statusDireita && statusEsquerda ? ' | ' : ''} ${statusEsquerda}`;
                statusText.style.color = "#00FF00";
            }
        } else if (!maoDireita && !maoEsquerda) {
            // quando nao ha maoes voltar tudo a 0
            if (gestoAlvo !== null) statusText.innerText = ""; // Mantém o ecrã limpo na aprendizagem
            else {
                statusText.innerText = "Nenhuma mão visível.";
                statusText.style.color = "#ff9800";
            }
            // função de reset
            resetFeedbackHTML();
        } else {
            statusText.innerText = "";
        }
    }

    canvasCtx.restore();
});


// =========================================================================
// 4. LÓGICA DE RECONHECIMENTO & SEGMENTAÇÃO (DTW)
// =========================================================================

/**
 * #my_code: Normaliza as landmarks da mão compensando o aspect ratio e a escala/translação.
 */
function normalizarLandmarks(landmarks, larguraCamara, alturaCamara) {
    const largura = larguraCamara || videoElement.videoWidth || 640;
    const altura = alturaCamara || videoElement.videoHeight || 480;
    const proporcaoCamara = largura / altura;

    // Corrigir o eixo x para anular a distorção do retângulo
    const pontosCorrigidos = landmarks.map(ponto => ({
        x: ponto.x * proporcaoCamara, // Esticamos o x para ser igual ao y
        y: ponto.y,
        z: ponto.z
    }));

    const pulso = pontosCorrigidos[0];
    const baseMedio = pontosCorrigidos[9];

    // Euclidiana que mede em linha reta o "osso" da palma da mão.
    const tamanhoPalma = Math.sqrt(
        Math.pow(baseMedio.x - pulso.x, 2) + Math.pow(baseMedio.y - pulso.y, 2)
    );

    // Normalizamos a translação e escala
    return pontosCorrigidos.map(ponto => ({
        x: (ponto.x - pulso.x) / tamanhoPalma,
        y: (ponto.y - pulso.y) / tamanhoPalma,
        z: (ponto.z - pulso.z) / tamanhoPalma
    }));
}

/**
 * #my_code: Processa uma mão unificando a avaliação estática e o carregamento do buffer dinâmico.
 */
function processarMaoUnificada(canvasCtx, mao, labelMao, poseCorpo, corConector) {
    drawConnectors(canvasCtx, mao, HAND_CONNECTIONS, { color: corConector, lineWidth: 5 });
    drawLandmarks(canvasCtx, mao, { color: '#FF0000', lineWidth: 2 });

    // ── 1. CONSTRUIR FRAME  {mao, zona, corpo, distRelFace} ──
    const maoNormalizada = normalizarLandmarks(mao, canvasElement.width, canvasElement.height);

    // Espelhar mão esquerda para comparação com moldes gravados com a mão direita.
    const maoParaDTW = (labelMao === 'Left')
        ? maoNormalizada.map(p => ({ x: -p.x, y: p.y, z: p.z }))
        : maoNormalizada;

    let corpoRawFrame = null;
    let zonaFrame = "DESCONHECIDA";
    if (poseCorpo) {
        corpoRawFrame = {
            nariz: { x: poseCorpo[0].x, y: poseCorpo[0].y },
            ombroEsq: { x: poseCorpo[11].x, y: poseCorpo[11].y },
            ombroDir: { x: poseCorpo[12].x, y: poseCorpo[12].y },
            ancoraMao: { x: mao[0].x, y: mao[0].y }
        };
        zonaFrame = identificarZonaArticulacao(mao, poseCorpo);
    }
    const frameEnriquecida = {
        mao: maoParaDTW,
        zona: zonaFrame,
        corpo: corpoRawFrame,
        // Distâncias relativas ao nariz, ouvidos e boca (pose landmarks já calculados, custo zero)
        distRelFace: calcularDistRelFace(mao[0].x, mao[0].y, poseCorpo, labelMao)
    };

    // ── 3. SEGMENTAÇÃO HÍBRIDA ADAPTATIVA ──
    if (estadoApp === "AVALIACAO_DINAMICA" || estadoApp === "GRAVACAO_DINAMICA") {
        const bufferAtual = labelMao === 'Right' ? bufferMaoDireita : bufferMaoEsquerda;
        // Abdómen funciona como zona de repouso para os gestos dinâmicos!
        const emReposoPorZona = (zonaFrame === "FORA" || zonaFrame === "ABDOMEN");

        if (emReposoPorZona) {
            if (estadoSegmentacao[labelMao] === 'GRAVANDO') {
                estadoSegmentacao[labelMao] = 'DEBOUNCE';
                if (!timerDebounce[labelMao]) {
                    timerDebounce[labelMao] = setTimeout(() => { dispararAvaliacaoDTW(labelMao); }, DEBOUNCE_MS);
                }
            } else if (estadoSegmentacao[labelMao] === 'REPOUSO') {
                bufferAtual.length = 0;
            }
        } else {
            if (estadoSegmentacao[labelMao] === 'REPOUSO') {
                if (maoAtivaDTW === null || maoAtivaDTW === labelMao) {
                    maoAtivaDTW = labelMao;
                    if (timerDebounce[labelMao]) {
                        clearTimeout(timerDebounce[labelMao]);
                        timerDebounce[labelMao] = null;
                    }
                    bufferAtual.length = 0;
                    estadoSegmentacao[labelMao] = 'GRAVANDO';
                    console.log(`[SEG] ${labelMao}: REPOUSO → GRAVANDO | Zona: ${zonaFrame}`);
                }
            } else if (estadoSegmentacao[labelMao] === 'DEBOUNCE') {
                clearTimeout(timerDebounce[labelMao]);
                timerDebounce[labelMao] = null;
                estadoSegmentacao[labelMao] = 'GRAVANDO';
                console.log(`[SEG] ${labelMao}: DEBOUNCE → GRAVANDO (falso fim)`);
            }

            if (estadoSegmentacao[labelMao] === 'GRAVANDO') {
                bufferAtual.push(frameEnriquecida);
                if (bufferAtual.length > TAMANHO_MAX_BUFFER) bufferAtual.shift();
            }
        }
    }

    // ── 4. AVALIAÇÃO ESTÁTICA ──
    let statusTexto = "";
    if (estadoApp === "AVALIACAO") {
        const res = classificarGestoPorReferencia(
            mao,
            labelMao,
            poseCorpo,
            canvasElement.width,
            canvasElement.height,
            typeof gestoAlvo !== 'undefined' ? gestoAlvo : null
        );

        if (res && res.debug) {
            let statusGeral = res.reconhecido ? `Correto! (${res.reconhecido})` : `A tentar: ${typeof gestoAlvo !== 'undefined' ? gestoAlvo : '...'}`;
            let mensagemAlerta = "";

            if (!res.reconhecido) {
                if (res.debug.zonaAlvo && res.debug.zonaAlvo !== "DESCONHECIDA" && res.debug.zonaAtual !== res.debug.zonaAlvo) {
                    if (res.debug.zonaAtual === "FORA") {
                        mensagemAlerta = "<=>TRAZ A MÃO PARA A FRENTE DO CORPO!";
                    } else {
                        const ordemZonas = ["TESTA", "QUEIXO", "PEITO", "ABDOMEN"];
                        const indiceAtual = ordemZonas.indexOf(res.debug.zonaAtual);
                        const indiceAlvo = ordemZonas.indexOf(res.debug.zonaAlvo);

                        if (indiceAtual > indiceAlvo) {
                            mensagemAlerta = "^ SOBE A MÃO PARA A ZONA: " + res.debug.zonaAlvo;
                        } else if (indiceAtual < indiceAlvo) {
                            mensagemAlerta = "v BAIXA A MÃO PARA A ZONA: " + res.debug.zonaAlvo;
                        }
                    }
                }
                else if (res.debug.erroMaximo > 0.30) {
                    mensagemAlerta = `AJUSTA O ${res.debug.nomePontoErrado.toUpperCase()}!`;
                }
            }

            if (gestoAlvo !== null) {
                statusTexto = mensagemAlerta;
                const angIdeal = parseFloat(res.debug.anguloIdeal);
                const angAtual = parseFloat(res.debug.anguloAtual);
                let anguloVisualIdeal = labelMao === 'Right' ? 180 - angIdeal : angIdeal;
                let anguloVisualAtual = labelMao === 'Right' ? 180 - angAtual : angAtual;

                const mostrarBussola = document.getElementById('toggle-bussola') ? document.getElementById('toggle-bussola').checked : true;
                if (mostrarBussola) {
                    desenharBussola(canvasCtx, canvasElement.width - 100, 100, 50, anguloVisualIdeal, anguloVisualAtual);
                }

                atualizarFeedbackHTML(res.erro, angAtual.toFixed(1), angIdeal.toFixed(1), mensagemAlerta, res.reconhecido);
            } else {
                const prefixo = labelMao === 'Right' ? 'DIR:' : 'ESQ:';
                statusTexto = `${prefixo} ${statusGeral} (Erro: ${(res.erro * 100).toFixed(1)}%)`;
                if (mensagemAlerta !== "") statusTexto += ` | ${mensagemAlerta}`;
                statusTexto += `\n↳ Angulo: ${res.debug.anguloAtual}º | Alvo: ${res.debug.anguloIdeal}º`;
            }
        } else if (res && res.reconhecido) {
            const prefixo = labelMao === 'Right' ? 'DIR:' : 'ESQ:';
            statusTexto = `${prefixo} ${res.reconhecido} (${(res.erro * 100).toFixed(1)}%)`;
        }

        if (res && res.todosResultados) {
            atualizarPainelTelemetria(res.todosResultados, res.reconhecido);
        }
    }
}

/**
 * Chamada pelo debounce (400ms) após a mão regressar ao repouso.
 */
function dispararAvaliacaoDTW(labelMao) {
    const bufferAtual = labelMao === 'Right' ? bufferMaoDireita : bufferMaoEsquerda;

    // Resetar o estado desta mão e libertar a prioridade
    estadoSegmentacao[labelMao] = 'REPOUSO';
    timerDebounce[labelMao] = null;
    maoAtivaDTW = null;

    console.log(`[DTW] Disparo por fronteira! ${labelMao}: ${bufferAtual.length} frames capturadas.`);

    if (estadoApp === "GRAVACAO_DINAMICA") {
        if (bufferAtual.length > 8) {
            exportarGestoDinamico(bufferAtual, nomeGestoGravacao);
            document.getElementById('titulo-gesto').innerText = `Gravado: '${nomeGestoGravacao}'`;
            document.getElementById('titulo-gesto').style.color = '#4CAF50';
        } else {
            alert(`Erro: Gesto muito curto (${bufferAtual.length} frames).`);
            document.getElementById('titulo-gesto').innerText = "Modo Dinâmico...";
            document.getElementById('titulo-gesto').style.color = "white";
        }
        bufferAtual.length = 0;
        estadoApp = "AVALIACAO_DINAMICA"; // Retorna ao modo normal
        return;
    }

    if (bufferAtual.length < 8) {
        console.log(`[DTW] Sequência demasiado curta (${bufferAtual.length} frames). Ignorado.`);
        bufferAtual.length = 0;
        return;
    }
    if (typeof BASE_DADOS_DINAMICA === 'undefined' || BASE_DADOS_DINAMICA.length === 0) {
        console.warn("[DTW] Base de dados dinâmica vazia. Nenhum gesto para comparar.");
        bufferAtual.length = 0;
        return;
    }

    let menorErroDTW = Infinity;
    let gestoReconhecido = null;
    for (const moldeDinamico of BASE_DADOS_DINAMICA) {
        const erroDTW = calcularFastDTW(bufferAtual, moldeDinamico.frames);
        if (erroDTW < menorErroDTW) {
            menorErroDTW = erroDTW;
            gestoReconhecido = moldeDinamico.nome;
        }
    }

    const LIMITE_ACEITACAO_DTW = 0.25;
    const tituloHtml = document.getElementById('titulo-gesto');
    const telemetriaHtml = document.getElementById('lista-resultados');

    if (menorErroDTW < LIMITE_ACEITACAO_DTW) {
        console.log(`%c [DTW] ✓ ${gestoReconhecido} (Erro: ${menorErroDTW.toFixed(3)})`, 'color:green;font-weight:bold');
        tituloHtml.innerText = `Detetado: ${gestoReconhecido}!`;
        tituloHtml.style.color = '#4CAF50';
        telemetriaHtml.innerHTML = `<li><span style="color:#4CAF50">${gestoReconhecido}</span></li><li style="font-size:12px;color:gray">Erro FastDTW: ${menorErroDTW.toFixed(3)}</li>`;
    } else {
        console.log(`[DTW] ✗ Melhor: ${gestoReconhecido} (Erro: ${menorErroDTW.toFixed(3)})`);
        tituloHtml.innerText = "Gesto não reconhecido";
        tituloHtml.style.color = '#FF3333';
        telemetriaHtml.innerHTML = `<li><span style="color:#FF3333">Não reconhecido</span></li><li style="font-size:12px;color:gray">Encaixe: ${gestoReconhecido} (${menorErroDTW.toFixed(3)})</li>`;
    }

    bufferAtual.length = 0;
}


// =========================================================================
// 5. COMPONENTES VISUAIS & DESENHO (Canvas & HTML)
// =========================================================================

/**
 * Desenha as Bounding Boxes virtuais sobre o corpo do utilizador.
 */
function desenharZonasArticulacao(ctx, poseLandmarks, larguraCanvas, alturaCanvas) {
    if (!poseLandmarks || !poseLandmarks[0] || !poseLandmarks[11] || !poseLandmarks[12]) return;

    const narizY = poseLandmarks[0].y * alturaCanvas;
    const ombroEsqX = poseLandmarks[11].x * larguraCanvas;
    const ombroEsqY = poseLandmarks[11].y * alturaCanvas;
    const ombroDirX = poseLandmarks[12].x * larguraCanvas;
    const ombroDirY = poseLandmarks[12].y * alturaCanvas;

    const centroX = (ombroEsqX + ombroDirX) / 2;
    const larguraOmbros = Math.abs(ombroEsqX - ombroDirX);
    const larguraCaixa = larguraOmbros * 1.8;
    const xEsquerda = centroX - (larguraCaixa / 2);

    const linhaOmbrosY = (ombroEsqY + ombroDirY) / 2;
    const distanciaNarizOmbros = Math.abs(linhaOmbrosY - narizY);
    const tamanhoCabecaPescoco = Math.max(distanciaNarizOmbros, larguraOmbros * 0.45);

    const linhaFimPeitoY = linhaOmbrosY + (tamanhoCabecaPescoco * 1.5);
    const topoCabecaY = Math.max(0, narizY - (tamanhoCabecaPescoco * 1.2));
    const fimAbdomenY = linhaFimPeitoY + (tamanhoCabecaPescoco * 1.5);

    ctx.save();
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);

    const desenharCaixa = (yInicio, yFim, cor, texto) => {
        ctx.strokeStyle = cor;
        ctx.beginPath();
        ctx.rect(xEsquerda, yInicio, larguraCaixa, yFim - yInicio);
        ctx.stroke();

        ctx.save();
        ctx.translate(larguraCanvas, 0);
        ctx.scale(-1, 1);

        ctx.fillStyle = cor;
        ctx.font = "bold 16px monospace";

        const xTextoInvertido = larguraCanvas - (xEsquerda + larguraCaixa) + 8;
        ctx.fillText(texto, xTextoInvertido, yInicio + 22);

        ctx.restore();
    };

    desenharCaixa(topoCabecaY, narizY, "#FF00FF", "TESTA");
    desenharCaixa(narizY, linhaOmbrosY, "#00FFFF", "QUEIXO");
    desenharCaixa(linhaOmbrosY, linhaFimPeitoY, "#00FF00", "PEITO");
    desenharCaixa(linhaFimPeitoY, fimAbdomenY, "#FFA500", "ABDÓMEN");

    ctx.restore();
}

/**
 * Desenha o esqueleto fantasma de referência no ecrã.
 */
function desenharEsqueletoFantasma(canvasCtx, larguraCanvas, alturaCanvas, nomeGestoAlvo, labelMao) {
    let molde = BASE_DADOS_REFERENCIAS.find(ref => ref.nome === nomeGestoAlvo);
    if (!molde) {
        molde = BASE_DADOS_REFERENCIAS.find(ref => ref.nome.startsWith(nomeGestoAlvo + "_V"));
    }
    if (!molde) return;

    const origemX = larguraCanvas / 2;
    const origemY = alturaCanvas * 0.65;
    const fatorEscala = 120;

    const pontosFantasma = molde.pontos.map(ponto => {
        let px = ponto.x;
        if (labelMao === "Left") px = -px;
        return {
            x: origemX + (px * fatorEscala),
            y: origemY + (ponto.y * fatorEscala)
        };
    });

    canvasCtx.save();
    canvasCtx.globalAlpha = 0.4;
    canvasCtx.strokeStyle = "#FFFFFF";
    canvasCtx.lineWidth = 5;
    canvasCtx.lineCap = "round";

    if (typeof HAND_CONNECTIONS !== 'undefined') {
        HAND_CONNECTIONS.forEach(conexao => {
            const p1 = pontosFantasma[conexao[0]];
            const p2 = pontosFantasma[conexao[1]];
            if (p1 && p2) {
                canvasCtx.beginPath();
                canvasCtx.moveTo(p1.x, p1.y);
                canvasCtx.lineTo(p2.x, p2.y);
                canvasCtx.stroke();
            }
        });
    }

    canvasCtx.fillStyle = "rgba(255, 255, 255, 0.8)";
    pontosFantasma.forEach(p => {
        canvasCtx.beginPath();
        canvasCtx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
        canvasCtx.fill();
    });

    canvasCtx.restore();
}

/**
 * Desenha a bússola de tolerância angular.
 */
function desenharBussola(ctx, x, y, raio, anguloIdeal, anguloAtual) {
    const radIdeal = -(anguloIdeal * (Math.PI / 180));
    const radAtual = -(anguloAtual * (Math.PI / 180));
    const toleranciaRad = 50 * (Math.PI / 180);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, raio, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, raio, radIdeal - toleranciaRad, radIdeal + toleranciaRad);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(radIdeal) * raio, y + Math.sin(radIdeal) * raio);
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 4;
    ctx.stroke();

    const diff = Math.abs(anguloIdeal - anguloAtual);
    const diffReal = diff > 180 ? 360 - diff : diff;
    const estaCorreto = diffReal <= 50;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(radAtual) * raio, y + Math.sin(radAtual) * raio);
    ctx.strokeStyle = estaCorreto ? '#00FFFF' : '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = estaCorreto ? '#00FFFF' : '#FFFFFF';
    ctx.fill();

    ctx.restore();
}

/**
 * Atualiza os elementos HTML do painel de progresso (barra, alerta, debug).
 */
function atualizarFeedbackHTML(erroDecimal, angAtual, angIdeal, mensagemAlerta, reconhecido) {
    const painel = document.getElementById('painel-progresso');
    const barra = document.getElementById('barra-enchimento');
    const textoBarra = document.getElementById('texto-barra');
    const textoDebug = document.getElementById('texto-debug');
    const alertaDedo = document.getElementById('alerta-dedo');

    if (!painel || !barra) return;
    painel.style.display = 'block';

    const erroMaximo = 0.40; const erroMinimo = 0.10;
    let progresso = (erroMaximo - erroDecimal) / (erroMaximo - erroMinimo);
    progresso = Math.max(0, Math.min(1, progresso));

    let corBarra = "#FF3333"; let textoFeedback = "LONGE...";
    if (erroDecimal <= 0.10) { corBarra = "#00FF00"; textoFeedback = "FEITO!"; }
    else if (erroDecimal <= 0.25) { corBarra = "#FFA500"; textoFeedback = "QUASE LÁ!"; }

    barra.style.width = (progresso * 100) + "%";
    barra.style.backgroundColor = corBarra;
    textoBarra.innerText = textoFeedback;

    if (!reconhecido && mensagemAlerta !== "") {
        alertaDedo.innerText = mensagemAlerta;
    } else {
        alertaDedo.innerText = "";
    }

    textoDebug.innerHTML = `DEBUG >> Erro: ${(erroDecimal * 100).toFixed(1)}% | Ângulo: ${angAtual}º (Alvo: ${angIdeal}º)`;
}

function resetFeedbackHTML() {
    const barra = document.getElementById('barra-enchimento');
    const textoBarra = document.getElementById('texto-barra');
    const textoDebug = document.getElementById('texto-debug');
    const alertaDedo = document.getElementById('alerta-dedo');

    if (barra) {
        barra.style.width = "0%";
        barra.style.backgroundColor = "#FF3333";
    }
    if (textoBarra) textoBarra.innerText = "A aguardar mão...";
    if (alertaDedo) alertaDedo.innerText = "";
    if (textoDebug) textoDebug.innerHTML = "Erro: --% | Ângulo: --º / --º";
}

/**
 * Atualiza o painel lateral de telemetria mostrando a classificação de cada molde.
 */
function atualizarPainelTelemetria(resultados, gestoReconhecido) {
    const lista = document.getElementById('lista-resultados');
    if (!lista) return;

    lista.innerHTML = '';
    resultados.sort((a, b) => a.erro - b.erro);

    resultados.forEach(item => {
        const li = document.createElement('li');

        if (item.motivo === "Ângulo") {
            li.innerText = `${item.nome} : Bloqueado (Ângulo)`;
            li.style.color = "#ff4444";
        } else {
            const perc = (item.erro * 100).toFixed(1);

            if (item.nome === gestoReconhecido) {
                li.innerText = `>> ${item.nome} : ${perc}%`;
                li.style.color = "#00FF00";
                li.style.fontWeight = "bold";
            } else if (item.erroMax >= 0.35) {
                li.innerText = `${item.nome} : ${perc}% (Dedo Torto)`;
                li.style.color = "#FFA500";
            } else {
                li.innerText = `${item.nome} : ${perc}%`;
                li.style.color = "#FFFFFF";
            }
        }
        lista.appendChild(li);
    });
}


// =========================================================================
// 6. NAVEGAÇÃO DE MENUS & ROTEAMENTO (UI)
// =========================================================================

/** Esconde todos os menus de navegação */
function esconderTodosOsMenus() {
    const ids = [
        'view-menu-principal',
        'view-menu-aprendizagem',
        'view-menu-avaliacao',
        'view-menu-numeros-aprendizagem',
        'view-menu-letras-aprendizagem',
        'view-menu-numeros-avaliacao',
        'view-menu-letras-avaliacao',
        'view-camara'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    document.getElementById('painel-telemetria').style.display = 'none';
}

// ── Menu Principal ──
function voltarAoMenuPrincipal() {
    esconderTodosOsMenus();
    document.getElementById('view-menu-principal').style.display = 'block';
    gestoAlvo = null;
    estadoApp = null;
}

// ── Aprendizagem ──
function abrirMenuAprendizagem() {
    esconderTodosOsMenus();
    document.getElementById('view-menu-aprendizagem').style.display = 'block';
}

function abrirMenuNumerosAprendizagem() {
    esconderTodosOsMenus();
    document.getElementById('view-menu-numeros-aprendizagem').style.display = 'block';
}

function abrirMenuLetrasAprendizagem() {
    esconderTodosOsMenus();
    document.getElementById('view-menu-letras-aprendizagem').style.display = 'block';
}

function voltarParaAprendizagem() {
    esconderTodosOsMenus();
    document.getElementById('view-menu-aprendizagem').style.display = 'block';
    gestoAlvo = null;
}

// ── Avaliação ──
function abrirMenuAvaliacao() {
    esconderTodosOsMenus();
    document.getElementById('view-menu-avaliacao').style.display = 'block';
}

function abrirMenuNumerosAvaliacao() {
    esconderTodosOsMenus();
    document.getElementById('view-menu-numeros-avaliacao').style.display = 'block';
}

function abrirMenuLetrasAvaliacao() {
    esconderTodosOsMenus();
    document.getElementById('view-menu-letras-avaliacao').style.display = 'block';
}

function voltarParaAvaliacao() {
    esconderTodosOsMenus();
    document.getElementById('view-menu-avaliacao').style.display = 'block';
    gestoAlvo = null;
}

// ── Modos de câmara ──
function abrirModoLivre() {
    gestoAlvo = null;
    esconderTodosOsMenus();
    document.getElementById('view-camara').style.display = 'block';
    document.getElementById('titulo-gesto').innerText = "Avaliação Estática Livre";
    document.getElementById('painel-telemetria').style.display = 'block';
    estadoApp = "AVALIACAO";

    // Desativar ajudas no modo avaliação
    const btnDefinicoes = document.getElementById('btn-definicoes-camara');
    if (btnDefinicoes) btnDefinicoes.style.display = 'none';
    const cartaoRef = document.getElementById('cartao-referencia');
    if (cartaoRef) cartaoRef.style.display = 'none';
    const toggleFantasma = document.getElementById('toggle-fantasma');
    if (toggleFantasma) toggleFantasma.checked = false;
    const toggleZonas = document.getElementById('toggle-zonas');
    if (toggleZonas) toggleZonas.checked = false;
    const toggleImagem = document.getElementById('toggle-imagem');
    if (toggleImagem) toggleImagem.checked = false;
    const toggleBussola = document.getElementById('toggle-bussola');
    if (toggleBussola) toggleBussola.checked = true;
}

function iniciarTreino(nomeGesto) {
    gestoAlvo = nomeGesto;

    // Detetar automaticamente se o gesto é dinâmico (Letra_D, Letra_K, Letra_W, Letra_Y, Letra_Z)
    const esDinamico = typeof LETRAS_DINAMICAS !== 'undefined' && LETRAS_DINAMICAS.includes(nomeGesto.split('_V')[0]);
    estadoApp = esDinamico ? "AVALIACAO_DINAMICA" : "AVALIACAO";

    // Resetar o estado da segmentação para gestos dinâmicos
    if (esDinamico) {
        bufferMaoDireita = [];
        bufferMaoEsquerda = [];
        estadoSegmentacao['Right'] = 'REPOUSO';
        estadoSegmentacao['Left'] = 'REPOUSO';
        maoAtivaDTW = null;
    }

    esconderTodosOsMenus();
    document.getElementById('view-camara').style.display = 'block';
    document.getElementById('painel-progresso').style.display = esDinamico ? 'none' : 'none';
    document.getElementById('titulo-gesto').innerText = `A aprender: ${nomeGesto.replace(/_/g, ' ')}`;

    const btnDefinicoes = document.getElementById('btn-definicoes-camara');
    if (btnDefinicoes) btnDefinicoes.style.display = 'block';

    const cartaoRef = document.getElementById('cartao-referencia');
    const imgRef = document.getElementById('img-referencia');
    const mostrarImagem = document.getElementById('toggle-imagem') ? document.getElementById('toggle-imagem').checked : true;

    if (cartaoRef && imgRef) {
        if (mostrarImagem) {
            const nomeBaseGesto = nomeGesto.split('_V')[0];
            let subPasta = "";
            if (nomeBaseGesto.startsWith("Numero")) {
                subPasta = "numeros/";
            } else if (nomeBaseGesto.startsWith("Letra")) {
                subPasta = "abcedario/";
            }
            imgRef.src = `referenciaphotos/${subPasta}${nomeBaseGesto}.png`;
            cartaoRef.style.display = 'block';
        } else {
            cartaoRef.style.display = 'none';
        }
    }
}

// #my_code: Lógica dedicada para o Modo de Avaliação (sem ajudas visuais / "Modo Exame")
function iniciarAvaliacao(nomeGesto) {
    gestoAlvo = nomeGesto;

    // Detetar automaticamente se o gesto é dinâmico
    const esDinamico = typeof LETRAS_DINAMICAS !== 'undefined' && LETRAS_DINAMICAS.includes(nomeGesto.split('_V')[0]);
    estadoApp = esDinamico ? "AVALIACAO_DINAMICA" : "AVALIACAO";

    // Resetar o estado da segmentação para gestos dinâmicos
    if (esDinamico) {
        bufferMaoDireita = [];
        bufferMaoEsquerda = [];
        estadoSegmentacao['Right'] = 'REPOUSO';
        estadoSegmentacao['Left'] = 'REPOUSO';
        maoAtivaDTW = null;
    }

    esconderTodosOsMenus();
    document.getElementById('view-camara').style.display = 'block';
    document.getElementById('painel-progresso').style.display = 'none';
    document.getElementById('titulo-gesto').innerText = `A avaliar: ${nomeGesto.replace(/_/g, ' ')}`;

    // Desativar ajudas no modo avaliação
    const btnDefinicoes = document.getElementById('btn-definicoes-camara');
    if (btnDefinicoes) btnDefinicoes.style.display = 'none';
    const cartaoRef = document.getElementById('cartao-referencia');
    if (cartaoRef) cartaoRef.style.display = 'none';
    const toggleFantasma = document.getElementById('toggle-fantasma');
    if (toggleFantasma) toggleFantasma.checked = false;
    const toggleZonas = document.getElementById('toggle-zonas');
    if (toggleZonas) toggleZonas.checked = false;
    const toggleImagem = document.getElementById('toggle-imagem');
    if (toggleImagem) toggleImagem.checked = false;
    const toggleBussola = document.getElementById('toggle-bussola');
    if (toggleBussola) toggleBussola.checked = true;
}

function voltarAoMenu() {
    esconderTodosOsMenus();

    const cartaoRef = document.getElementById('cartao-referencia');
    if (cartaoRef) cartaoRef.style.display = 'none';
    const painelProgresso = document.getElementById('painel-progresso');
    if (painelProgresso) painelProgresso.style.display = 'none';
    const btnDefinicoes = document.getElementById('btn-definicoes-camara');
    if (btnDefinicoes) btnDefinicoes.style.display = 'none';

    // Volta ao menu principal
    document.getElementById('view-menu-principal').style.display = 'block';
    gestoAlvo = null;
    estadoApp = null;
}

function abrirModoDinamico() {
    esconderTodosOsMenus();
    document.getElementById('view-camara').style.display = 'block';
    document.getElementById('painel-telemetria').style.display = 'block';

    const tituloHtml = document.getElementById('titulo-gesto');
    tituloHtml.innerText = "Modo Dinâmico a decorrer...";
    tituloHtml.style.color = "white";

    document.getElementById('lista-resultados').innerHTML = "<li>Faz um gesto (Ex: Branco, Fixe, Dor) e volta à posição de repouso.</li>";
    document.getElementById('painel-progresso').style.display = 'none';

    estadoApp = "AVALIACAO_DINAMICA";
    gestoAlvo = null;

    bufferMaoDireita = [];
    bufferMaoEsquerda = [];

    // Desativar ajudas no modo avaliação
    const btnDefinicoes = document.getElementById('btn-definicoes-camara');
    if (btnDefinicoes) btnDefinicoes.style.display = 'none';
    const cartaoRef = document.getElementById('cartao-referencia');
    if (cartaoRef) cartaoRef.style.display = 'none';
    const toggleFantasma = document.getElementById('toggle-fantasma');
    if (toggleFantasma) toggleFantasma.checked = false;
    const toggleZonas = document.getElementById('toggle-zonas');
    if (toggleZonas) toggleZonas.checked = false;
    const toggleImagem = document.getElementById('toggle-imagem');
    if (toggleImagem) toggleImagem.checked = false;
    const toggleBussola = document.getElementById('toggle-bussola');
    if (toggleBussola) toggleBussola.checked = true;
}

function abrirDefinicoes() {
    document.getElementById('modal-definicoes').style.display = 'flex';
}

function fecharDefinicoes() {
    // Esconde o menu de definições
    document.getElementById('modal-definicoes').style.display = 'none';

    // Lemos o estado atual do botão da imagem nas definições
    const mostrarImagem = document.getElementById('toggle-imagem') ? document.getElementById('toggle-imagem').checked : true;
    const cartaoRef = document.getElementById('cartao-referencia');

    // Atualizamos a visibilidade da imagem IMEDIATAMENTE no HTML
    if (cartaoRef) {
        // Só volta a aparecer se a checkbox estiver ativa E se não estivermos no Modo Livre (onde gestoAlvo é null)
        if (mostrarImagem && gestoAlvo !== null) {
            cartaoRef.style.display = 'block';
        } else {
            cartaoRef.style.display = 'none';
        }
    }
}


// =========================================================================
// 7. UTILITÁRIOS DE GRAVAÇÃO (Developer Tools)
// =========================================================================

/**
 * Grava um template estático com pontos e corpo raw no JSON.
 */
function gravarReferencia(landmarks, poseLandmarks, nomeGesto, labelMao) {
    const landmarksNormalizados = normalizarLandmarks(landmarks, canvasElement.width, canvasElement.height);

    let corpoRaw = null;
    if (poseLandmarks && landmarks) {
        corpoRaw = {
            nariz: { x: poseLandmarks[0].x, y: poseLandmarks[0].y },
            ombroEsq: { x: poseLandmarks[11].x, y: poseLandmarks[11].y },
            ombroDir: { x: poseLandmarks[12].x, y: poseLandmarks[12].y },
            ancoraMao: { x: landmarks[0].x, y: landmarks[0].y }
        };
    }

    const objParaGravar = {
        pontos: landmarksNormalizados,
        corpo: corpoRaw
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(objParaGravar, null, 2));
    const downloadAnchorNode = document.createElement('a');

    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", nomeGesto + "_template.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();

    console.log(`[DATA LOGGER] Molde de referência para '${nomeGesto}' descarregado com sucesso.`);
}

/**
 * Exporta a sequência de frames do buffer para o JSON no formato v3.
 */
function exportarGestoDinamico(buffer, nomeGesto) {
    const temDadosCorporais = buffer.length > 0 && buffer[0].corpo !== null;
    if (!temDadosCorporais) {
        console.warn("[DATA LOGGER] AVISO: Frames sem dados corporais! O corpo (ombros + nariz) precisa de estar visível durante a gravação para que as zonas funcionem.");
    }

    const pacoteDinamico = {
        nome: nomeGesto,
        versao_formato: 3,
        frames: buffer
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pacoteDinamico, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", nomeGesto + "_dinamico.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();

    console.log(`[DATA LOGGER] Gesto DINÂMICO '${nomeGesto}' exportado: ${buffer.length} frames | Formato v3 | Zonas: ${temDadosCorporais ? '✅' : '⚠️ re-gravar com corpo visível'}`);
}

// Ouvir gravação estática (Tecla S)
document.addEventListener('keydown', function (event) {
    if (event.key === 's' || event.key === 'S') {
        if (ultimaMaoDetetada && ultimaPoseDetetada && ultimaLabelMao) {
            const nomeGesto = prompt("Vais gravar uma referência. Qual é o nome do gesto? (Ex: Numero_1)");
            if (nomeGesto && nomeGesto.trim() !== "") {
                gravarReferencia(ultimaMaoDetetada, ultimaPoseDetetada, nomeGesto, ultimaLabelMao);
            }
        } else {
            alert("Erro: O sistema precisa de ver a MÃO e o CORPO para gravar com exatidão!");
        }
    }
});

// Ouvir gravação dinâmica (Tecla R)
document.addEventListener('keydown', function(event) {
    if (event.key === 'r' || event.key === 'R') {
        if (contadorRegressivo > 0) return;

        if (estadoApp === "GRAVACAO_DINAMICA" || estadoApp === "PRE_GRAVACAO") {
            estadoApp = "AVALIACAO_DINAMICA";
            clearInterval(timerContagem);
            contadorRegressivo = 0;
            document.getElementById('titulo-gesto').innerText = "Gravação cancelada!";
            document.getElementById('titulo-gesto').style.color = "white";
            return;
        }

        const nomeGesto = prompt("Vais gravar um gesto DINÂMICO. Qual é o nome? (Ex: Dor_v3)");
        if (!nomeGesto || nomeGesto.trim() === "") return;

        nomeGestoGravacao = nomeGesto.trim();
        bufferMaoDireita = [];
        bufferMaoEsquerda = [];
        estadoSegmentacao['Right'] = 'REPOUSO';
        estadoSegmentacao['Left'] = 'REPOUSO';
        maoAtivaDTW = null;

        estadoApp = "PRE_GRAVACAO";
        contadorRegressivo = 3;

        const tituloHtml = document.getElementById('titulo-gesto');
        tituloHtml.style.color = '#FF9800';

        timerContagem = setInterval(() => {
            if (contadorRegressivo > 0) {
                tituloHtml.innerText = `⚠ Prepara a posição de repouso... ${contadorRegressivo}`;
                contadorRegressivo--;
            } else {
                clearInterval(timerContagem);
                contadorRegressivo = 0;
                estadoApp = "GRAVACAO_DINAMICA";
                tituloHtml.innerText = `⏺ A GRAVAR: '${nomeGestoGravacao}' — Suba a mão para iniciar, e volte a baixar para guardar.`;
                tituloHtml.style.color = '#FF3333';
                console.log(`%c [REC AUTO] Pronta para capturar '${nomeGestoGravacao}' ao sair da zona de repouso.`, 'background:red;color:white;font-weight:bold;font-size:14px');
            }
        }, 1000);
    }
});

// =========================================================================
// 8. LISTENERS DE INTERFACE
// =========================================================================

// Atualizar Imagem de Referência em tempo real
const toggleImagem = document.getElementById('toggle-imagem');
if (toggleImagem) {
    toggleImagem.addEventListener('change', function() {
        const cartaoRef = document.getElementById('cartao-referencia');
        if (cartaoRef) {
            // Se estiver marcado, mostra (block), senão esconde (none)
            cartaoRef.style.display = this.checked ? 'block' : 'none';
        }
    });
}

// Atualizar Barra de Progresso em tempo real (opcional, caso queiras dar toggle a isto no futuro)
const toggleZonas = document.getElementById('toggle-zonas');
if (toggleZonas) {
    toggleZonas.addEventListener('change', function() {
        // Para os elementos do Canvas (Fantasma, Zonas, Bússola), o MediaPipe
        // já desenha em loop constante. Como tu lês o 'checked' a cada frame
        // dentro da função onResults (linha 115), eles deviam atualizar-se
        // praticamente em tempo real.
    });
}