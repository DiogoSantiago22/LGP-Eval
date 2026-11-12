let BASE_DADOS_DINAMICA = [];

const GESTOS_DINAMICOS_A_CARREGAR = [
    "Branco_v1",
    "Branco_v2",
    "Branco_v4",
    "Branco_v3",
    "Branco_v5",
    "Dor_v1",
    "Dor_v2",
    "Fixe_v1",
    "Fixe_v2",
    "Mascara_v1",
    "Mascara_v2",

    "Letra_K",
    "Letra_W",
    "Letra_Y",
    "Letra_Z"
];

async function carregarReferenciasDinamicas() {
    console.log("[SISTEMA] A carregar pacotes DTW de referenciaDTW...");

    for (const nomeGesto of GESTOS_DINAMICOS_A_CARREGAR) {
        try {
            const cacheBuster = new Date().getTime();
            const caminhoFicheiro = `./referencia/referenciaDTW/${nomeGesto}_dinamico.json?v=${cacheBuster}`;

            const resposta = await fetch(caminhoFicheiro);
            if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

            const jsonDinamico = await resposta.json();

            BASE_DADOS_DINAMICA.push(jsonDinamico);

            // Diagnóstico de formato: v1 (mão) | v2 (mão + zona + corpo) | v3 (+ distRelFace[5])
            const versao      = jsonDinamico.versao_formato || 1;
            const temZonas    = jsonDinamico.frames?.length > 0 && jsonDinamico.frames[0].zona !== undefined;
            const temDistFace = jsonDinamico.frames?.length > 0 && jsonDinamico.frames[0].distRelFace !== undefined;
            console.log(`[DTW] Carregado: ${nomeGesto} | ${jsonDinamico.frames.length} frames | Formato v${versao} | Zonas: ${temZonas ? '✅' : '⚠️ re-gravar'} | DistFace: ${temDistFace ? '✅' : '⚠️ re-gravar'}`);
        } catch (erro) {
            console.error(`[DTW] Falha ao carregar ${nomeGesto}:`, erro);
        }
    }
}

carregarReferenciasDinamicas()