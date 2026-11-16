let BASE_DADOS_REFERENCIAS = [];

const NUMEROS_A_CARREGAR = [
    "Numero_0", "Numero_0_V1", "Numero_0_V2",
    "Numero_1_V1", "Numero_1_V2",
    "Numero_2_V1", "Numero_2_V2",
    "Numero_3", "Numero_3_V1", "Numero_3_V2",
    "Numero_4", "Numero_4_V1", "Numero_4_V2",
    "Numero_5", "Numero_5_V1", "Numero_5_V2",
    "Numero_6", "Numero_6_V1", "Numero_6_V2",
    "Numero_7", "Numero_7_V2",
    "Numero_8", "Numero_8_V2",
    "Numero_9", "Numero_9_V1", "Numero_9_V2"
];

const LETRAS_ESTATICAS = [
    "Letra_A", "Letra_B", "Letra_C", "Letra_E",
    "Letra_F", "Letra_G", "Letra_H", "Letra_I",
    "Letra_J", "Letra_L", "Letra_M", "Letra_N",
    "Letra_O", "Letra_P", "Letra_Q", "Letra_R",
    "Letra_S", "Letra_T", "Letra_U", "Letra_V",
    "Letra_X"
];

// Letras dinâmicas (motor DTW com banda de Sakoe-Chiba)
const LETRAS_DINAMICAS = ["Letra_D", "Letra_K", "Letra_W", "Letra_Y", "Letra_Z"];

async function carregarFicheiro(nomeGesto, pasta, cacheBuster = Date.now()) {
    try {
        const caminho = `./referencia/${pasta}/${nomeGesto}_template.json?v=${cacheBuster}`;
        const resposta = await fetch(caminho);
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        const json = await resposta.json();
        BASE_DADOS_REFERENCIAS.push({
            nome: nomeGesto,
            pontos: json.pontos ? json.pontos : json,
            corpo: json.corpo ? json.corpo : null,
            zona_articulacao: json.zona_articulacao ? json.zona_articulacao : null
        });
        console.log(`[REF] Carregado: ${nomeGesto}`);
    } catch (erro) {
        console.error(`[REF] Falhou: ${nomeGesto} (${pasta}) —`, erro.message);
    }
}

async function carregarTodasAsReferencias() {
    console.log("[SISTEMA] A iniciar carregamento de referências...");
    BASE_DADOS_REFERENCIAS = [];
    const cacheBuster = Date.now();

    const promessasNumeros = NUMEROS_A_CARREGAR.map((nome) =>
        carregarFicheiro(nome, "referencia_numeros", cacheBuster)
    );

    const promessasLetras = LETRAS_ESTATICAS.map((nome) =>
        carregarFicheiro(nome, "referencia_letras", cacheBuster)
    );

    await Promise.all([...promessasNumeros, ...promessasLetras]);
    console.log(`[SISTEMA] Base de dados pronta. ${BASE_DADOS_REFERENCIAS.length} referências carregadas.`);
}

carregarTodasAsReferencias();