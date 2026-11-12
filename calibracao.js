const MARGEM_ESQ = 0.25;
const MARGEM_CIMA = 0.15;
const LARGURA_CAIXA = 0.50;
const ALTURA_CAIXA = 0.70;

function inicializarCalibracao() {
    // Agora procuramos apenas uma flag booleana de conclusão
    let calibracaoConcluida = localStorage.getItem('lgp_onboarding_ok');
    if (calibracaoConcluida) {
        estadoApp = "AVALIACAO";
    } else {
        estadoApp = "CALIBRACAO";
    }
}

// Desenha a UI quando a câmara não vê nenhuma mão
function desenharCaixaEspera(canvasCtx, larguraEcra, alturaEcra) {
    canvasCtx.strokeStyle = "#FFFFFF";
    canvasCtx.lineWidth = 4;
    canvasCtx.setLineDash([10, 10]);
    canvasCtx.strokeRect(larguraEcra * MARGEM_ESQ, alturaEcra * MARGEM_CIMA, larguraEcra * LARGURA_CAIXA, alturaEcra * ALTURA_CAIXA);
    canvasCtx.setLineDash([]);
}

// #my_code: O Motor de Auto-Captura e UI (Quando a mão já está presente)
function executarCalibracaoUI(landmarks,ladoDetetado, canvasCtx, larguraEcra, alturaEcra) {

    //  Verificar se a mão inteira (neste caso os 21 pontos) está dentro da caixa global
    let maoTotalmenteDentro = true;
    for (let i = 0; i < landmarks.length; i++) {
        if (landmarks[i].x < MARGEM_ESQ || landmarks[i].x > (MARGEM_ESQ + LARGURA_CAIXA) ||
            landmarks[i].y < MARGEM_CIMA || landmarks[i].y > (MARGEM_CIMA + ALTURA_CAIXA)) {
            maoTotalmenteDentro = false;
            break; // Se um único ponto estiver fora, aborta a verificação
        }
    }

    //  Os dedos têm de estar abertos (Postura)
    const polegarAberto = calcularAngulo(landmarks[0], landmarks[2], landmarks[4]) > 130;
    const indicadorAberto = calcularAngulo(landmarks[0], landmarks[5], landmarks[8]) > 150;
    const medioAberto = calcularAngulo(landmarks[0], landmarks[9], landmarks[12]) > 150;
    const anelarAberto = calcularAngulo(landmarks[0], landmarks[13], landmarks[16]) > 150;
    const mindinhoAberto = calcularAngulo(landmarks[0], landmarks[17], landmarks[20]) > 150;

    const maoTotalmenteAberta = polegarAberto && indicadorAberto && medioAberto && anelarAberto && mindinhoAberto;

    //Desenhar a Caixa de Captura Dinâmica
    canvasCtx.strokeStyle = maoTotalmenteDentro ? "#00FF00" : "#FFFFFF";
    canvasCtx.lineWidth = 4;
    canvasCtx.setLineDash([10, 10]);
    canvasCtx.strokeRect(larguraEcra * MARGEM_ESQ, alturaEcra * MARGEM_CIMA, larguraEcra * LARGURA_CAIXA, alturaEcra * ALTURA_CAIXA);
    canvasCtx.setLineDash([]);

    //Feedback visual do esqueleto
    const corEsqueleto = (maoTotalmenteDentro && maoTotalmenteAberta) ? '#00FF00' : '#FFFFFF';
    drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: corEsqueleto, lineWidth: 2});
    drawLandmarks(canvasCtx, landmarks, {color: '#FF0000', lineWidth: 2});

    const statusText = document.getElementById('status');

    // Instruções rigorosas
    if (!maoTotalmenteDentro) {
        statusText.innerText = "Coloca a MÃO TODA dentro da caixa tracejada...";
        statusText.style.color = "#FFFFFF";
    } else if (!maoTotalmenteAberta) {
        statusText.innerText = "Abre totalmente os dedos...";
        statusText.style.color = "#ff9800";
    }

    // Uma avaliação de sucesso
    if (maoTotalmenteDentro && maoTotalmenteAberta) {
        // PERSISTÊNCIA: Guardar apenas que o passo foi concluído
        localStorage.setItem('lgp_onboarding_ok', 'true');
        estadoApp = "AVALIACAO";
        statusText.innerText = "CALIBRADO COM SUCESSO! A iniciar motor...";
        statusText.style.color = "#4CAF50";
    }
}