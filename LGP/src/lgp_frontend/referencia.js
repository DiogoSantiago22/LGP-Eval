let BASE_DADOS_REFERENCIAS = [];

// Números (pasta: referencia_numeros/)
const NUMEROS_A_CARREGAR = [
    "Numero_0", "Numero_0_V1", "Numero_0_V2",
    "Numero_1", "Numero_1_V1", "Numero_1_V2",
    "Numero_2", "Numero_2_V1", "Numero_2_V2",
    "Numero_3", "Numero_3_V1", "Numero_3_V2",
    "Numero_4", "Numero_4_V1", "Numero_4_V2",
    "Numero_5", "Numero_5_V1", "Numero_5_V2",
    "Numero_6", "Numero_6_V1", "Numero_6_V2",
    "Numero_7", "Numero_7_V1", "Numero_7_V2", "Numero_7_V3",
    "Numero_8", "Numero_8_V1", "Numero_8_V2",
    "Numero_9", "Numero_9_V1", "Numero_9_V2"
];

// Letras estáticas (pasta: referencia_letras/)
// As que têm _dinamico.json são tratadas à parte (gestos dinâmicos)
const LETRAS_ESTATICAS = [
    // Letras Base
    "Letra_A", "Letra_B", "Letra_C", "Letra_E",
    "Letra_F", "Letra_G", "Letra_H", "Letra_I",
    "Letra_J", "Letra_L", "Letra_M", "Letra_N",
    "Letra_O", "Letra_P", "Letra_Q", "Letra_R",
    "Letra_S", "Letra_T", "Letra_U", "Letra_V",
    "Letra_X",

    // V1
    "Letra_A_V1",  "Letra_C_V1",
    "Letra_G_V1", "Letra_H_V1", "Letra_I_V1",
     "Letra_L_V1", "Letra_M_V1", "Letra_N_V1",
    "Letra_O_V1",  "Letra_Q_V1", "Letra_R_V1",
    "Letra_S_V1", "Letra_U_V1", "Letra_V_V1",
    "Letra_X_V1"
];

// Letras dinâmicas (usarão o motor FastDTW — serão implementadas depois)
const LETRAS_DINAMICAS = ["Letra_D", "Letra_K", "Letra_W", "Letra_Y", "Letra_Z"];

async function carregarFicheiro(nomeGesto, pasta) {
    try {
        const cacheBuster = new Date().getTime();
        const caminho = `./${pasta}/${nomeGesto}_template.json?v=${cacheBuster}`;
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

    for (const nome of NUMEROS_A_CARREGAR) {
        await carregarFicheiro(nome, "referencia_numeros");
    }

    for (const nome of LETRAS_ESTATICAS) {
        await carregarFicheiro(nome, "referencia_letras");
    }

    console.log(`[SISTEMA] Base de dados pronta. ${BASE_DADOS_REFERENCIAS.length} referências carregadas.`);
}

carregarTodasAsReferencias();