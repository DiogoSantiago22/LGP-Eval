# LGP-Eval

**[Experimentar a Demo Online](https://diogosantiago22.github.io/LGP-Eval/)**

Aplicação web de aprendizagem e avaliação de gestos da **Língua Gestual Portuguesa (LGP)** em tempo real, usando apenas uma webcam. Projeto final da Licenciatura em Engenharia Informática e Multimédia (LEIM), ISEL, 2025/2026.

Em vez de se limitar a dizer se um gesto foi reconhecido, o LGP-Eval diz **o que corrigir**: a posição de um dedo, a inclinação do pulso ou a zona do corpo onde o gesto é feito.

Aplicação web de aprendizagem e avaliação de gestos da **Língua Gestual Portuguesa (LGP)** em tempo real, usando apenas uma webcam. Projeto final da Licenciatura em Engenharia Informática e Multimédia (LEIM), ISEL, 2025/2026.

Em vez de se limitar a dizer se um gesto foi reconhecido, o LGP-Eval diz **o que corrigir**: a posição de um dedo, a inclinação do pulso ou a zona do corpo onde o gesto é feito.

## Funcionalidades

- **Aprendizagem guiada** (números 0-9 e letras A-Z): fotografia do gesto, esqueleto "fantasma" de referência, bússola de inclinação do pulso, zonas do corpo e alertas textuais ("ajusta o dedo médio", "sobe a mão para a zona: PEITO"). Cada ajuda pode ser ligada ou desligada nas definições.
- **Avaliação** sem ajudas: gestos estáticos (compara a forma da mão com referências) e gestos dinâmicos (compara a sequência de movimento).
- **Gestos dinâmicos** (letras D, K, W, Y, Z e gestos da base dinâmica) com início e fim detetados automaticamente, sem botões.
- **Gravação de novas referências** (ferramenta de desenvolvimento): tecla `S` grava um gesto estático, tecla `R` grava um gesto dinâmico com contagem decrescente de 3 segundos. Ambos exportam um ficheiro JSON.
- **Calibração inicial** que confirma que a mão está inteira e aberta dentro da caixa antes de começar.

## Como funciona

```
Webcam -> MediaPipe Holistic (mãos + pose, WebAssembly, no browser)
       -> normalização da mão (invariante a posição e escala)
       -> zona do corpo (testa / queixo / peito / abdómen / fora)
       -> motor estático   : erro vs. referências JSON
          motor dinâmico   : buffer de frames -> DTW com banda de Sakoe-Chiba
       -> feedback no Canvas e no HTML
```

**Normalização.** Os 21 pontos da mão são corrigidos pela proporção da imagem, transladados para o pulso e divididos pela distância pulso-base do dedo médio. Assim a comparação não depende da distância à câmara.

**Zonas do corpo.** Quatro caixas calculadas em tempo real a partir do nariz e dos ombros, por isso adaptam-se às proporções de cada utilizador. A zona entra na decisão: na avaliação estática, estar na zona errada acrescenta uma penalização ao erro.

**Motor estático.** Calcula a distância média dos 21 pontos a cada referência (há várias variantes por gesto). O gesto é aceite se o erro médio for inferior a 0,25, nenhum ponto isolado ultrapassar 0,42 e a inclinação estiver dentro de 50 graus. O ponto com maior erro é o que gera o alerta ao utilizador.

**Motor dinâmico.** Cada frame guarda a mão normalizada, a zona, a pose e cinco distâncias do pulso a pontos da face. As sequências comparam-se com **DTW com banda de Sakoe-Chiba** (largura 10), que tolera diferenças de velocidade sem permitir alinhamentos absurdos, e aceitam-se com custo normalizado inferior a 0,25. A penalização por zona errada é 1,20.

**Segmentação automática.** Uma máquina de estados por mão (`REPOUSO` -> `GRAVANDO` -> `DEBOUNCE`) começa a guardar frames quando a mão sai da zona de repouso (abdómen ou fora do ecrã) e termina quando regressa e fica 400 ms em repouso. O buffer guarda no máximo 150 frames (cerca de 5 s) e os segmentos com menos de 8 frames são ignorados.

## Tecnologias

HTML5, CSS3, JavaScript (ES6, sem frameworks), HTML5 Canvas, MediaPipe Holistic, JSON para as referências e `localStorage` para lembrar que a calibração foi feita.

## Estrutura

```
LGP-Eval/
├── LGP/
│   ├── index.html
│   ├── style.css
│   ├── app2.js              # ciclo principal, estados, segmentação, interface
│   ├── math.js              # normalização, classificação estática, DTW
│   ├── calibracao.js        # calibração inicial
│   ├── referencia.js        # carregamento das referências estáticas
│   ├── referencia_numeros/  # JSON dos números
│   ├── referencia_letras/   # JSON das letras
│   └── referenciaDTW/       # base de dados dinâmica
└── docs/                    # relatório
```

## Executar localmente

Precisa de um browser recente (Chrome ou Edge), de uma webcam e de ligação à Internet (o MediaPipe é carregado por CDN).

```bash
git clone https://github.com/DiogoSantiago22/LGP-Eval.git
cd LGP-Eval/LGP
python -m http.server 8000
```

Abrir `http://localhost:8000` e permitir o acesso à câmara. É preciso um servidor HTTP porque as referências são carregadas com `fetch`; a câmara só funciona em `localhost` ou HTTPS.

## Validação

Estudo de usabilidade com **7 utilizadores** (sem experiência prévia em LGP, 6 deles sem formação técnica; 4 com 45 ou mais anos). Cada um fez uma tarefa de treino estático (o número dois) e respondeu à *System Usability Scale* e a perguntas sobre a experiência.

| Indicador | Resultado |
|---|---|
| Conclusão da tarefa | 7 em 7 |
| SUS médio | **89,3** (seis participantes entre 90,0 e 97,5; um com 65,0) |
| Clareza do feedback (1-5) | 4,4 |
| Atraso percecionado (1-5, menor é melhor) | 1,3 |
| Recomendação (0-10) | 9,4 |

**Leitura honesta dos resultados.** Foi um estudo de usabilidade com uma amostra pequena e uma única tarefa estática; **não mede a precisão do reconhecimento** nem avalia os gestos dinâmicos. O participante com 65 pontos apontou a fricção de ter de voltar ao menu entre exercícios.

Problemas reportados pelos participantes: arranque lento sem indicador de progresso, dificuldade na deteção da mão com pouca luz, navegação entre exercícios e excesso de ajudas visuais ativas por omissão.

## Limitações e trabalho futuro

- Alargar a base de gestos de referência e a validação a mais utilizadores, incluindo falantes de LGP.
- Medir a taxa de reconhecimento (por exemplo com uma matriz de confusão), sobretudo nos gestos dinâmicos.
- Trocar de exercício sem voltar ao menu, indicador de carregamento no arranque e menos ajudas ativas por omissão.
- Todas as referências são carregadas para memória no arranque, o que não escala para bases muito maiores (carregamento a pedido).
- O MediaPipe infere a posição 3D a partir de uma única imagem RGB, por isso é sensível a luz e enquadramento.

## Privacidade

O vídeo é processado localmente no browser e não é enviado para nenhum servidor do projeto. As bibliotecas MediaPipe vêm de uma CDN, o que não envia o vídeo para a CDN. A única coisa guardada é a chave `lgp_onboarding_ok` no `localStorage`.

## Utilização de IA generativa

Foram usados modelos de linguagem na revisão de texto, na estrutura do relatório em LaTeX e na refatorização de excertos de código, de acordo com as normas da unidade curricular. O código de autoria integral dos autores está assinalado com a etiqueta `#my_code`, e as interações relevantes estão documentadas no anexo do relatório.

## Autores e orientação

- Rodrigo Neves (51452)
- Diogo Santiago (51998)

Orientadores: Prof. Doutor Pedro Mendes Jorge e Prof. Tiago Gonçalves. Unidade curricular de Projeto, LEIM, ISEL, 2025/2026. O relatório completo está em `docs/`.
