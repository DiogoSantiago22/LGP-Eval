Sistema web de aprendizagem e avaliação de gestos da **Língua Gestual Portuguesa (LGP)**, desenvolvido no âmbito da unidade curricular de Projeto da Licenciatura em Engenharia Informática e Multimédia (LEIM), no Instituto Superior de Engenharia de Lisboa (ISEL).

O LGP-Eval utiliza a câmara do dispositivo para acompanhar a execução dos gestos em tempo real e fornecer **feedback visual e textual**, ajudando o utilizador a identificar e corrigir aspetos como a configuração da mão, a inclinação do pulso e a zona do corpo onde o gesto é realizado.

Ao contrário de uma aplicação que se limita a indicar se um gesto foi reconhecido, o LGP-Eval procura apoiar o processo de aprendizagem através de orientação corretiva durante a execução.

---

## Índice

- [Funcionalidades](#funcionalidades)
- [Tecnologias utilizadas](#tecnologias-utilizadas)
- [Arquitetura e funcionamento](#arquitetura-e-funcionamento)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Requisitos](#requisitos)
- [Instalação e execução](#instalação-e-execução)
- [Como utilizar](#como-utilizar)
- [Dados de referência](#dados-de-referência)
- [Privacidade](#privacidade)
- [Validação](#validação)
- [Limitações e trabalho futuro](#limitações-e-trabalho-futuro)
- [Autores](#autores)
- [Orientação](#orientação)

---

## Funcionalidades

### Aprendizagem

O modo de aprendizagem permite selecionar um gesto e praticar a sua execução com o apoio de elementos visuais apresentados sobre a imagem da câmara.

Estão disponíveis conteúdos organizados em:

- **Números:** de 0 a 9.
- **Abecedário:** letras de A a Z.

Durante a aprendizagem, o sistema pode apresentar:

- Fotografia ilustrativa do gesto;
- Esqueleto fantasma com a configuração de referência da mão;
- Bússola visual para apoiar a correção da inclinação;
- Delimitação das zonas corporais de articulação;
- Alertas textuais que indicam o ajuste necessário.

### Avaliação

O modo de avaliação permite testar a execução dos gestos sem depender da orientação passo a passo do modo de aprendizagem.

O sistema contempla duas componentes:

- **Gestos estáticos:** compara a configuração da mão com os modelos de referência.
- **Gestos dinâmicos:** compara a sequência de movimento capturada com sequências de referência.

### Avaliação de gestos dinâmicos

A execução dos gestos dinâmicos é delimitada automaticamente através de uma máquina de estados. O sistema acompanha o movimento, identifica o regresso à posição de repouso e aguarda um curto intervalo para determinar o fim do gesto.

A sequência capturada é depois comparada com os modelos existentes através de uma abordagem baseada em Dynamic Time Warping (DTW).

### Gravação de referências

A aplicação inclui mecanismos para capturar e exportar referências de gestos em formato JSON. Estes ficheiros podem ser utilizados para preparar novos modelos, respeitando a estrutura de dados esperada pelo sistema.

---

## Tecnologias utilizadas

| Tecnologia | Utilização |
|---|---|
| HTML5 | Estrutura da interface |
| CSS3 | Estilos e apresentação visual |
| JavaScript | Lógica da aplicação e motores de avaliação |
| HTML5 Canvas | Desenho dos pontos articulares, guias e feedback visual |
| MediaPipe Holistic | Deteção de mãos e pose corporal a partir da câmara |
| MediaPipe Camera Utils | Captura e processamento dos fotogramas da câmara |
| MediaPipe Drawing Utils | Desenho de ligações e pontos articulares |
| JSON | Armazenamento dos modelos de referência |
| LocalStorage | Memorização da conclusão da calibração inicial |

O projeto foi desenvolvido em JavaScript nativo, sem recurso a frameworks de interface como React ou Angular e sem necessidade de um servidor de inferência.

As bibliotecas MediaPipe são carregadas através de CDN, pelo que é necessária uma ligação à Internet durante o carregamento da aplicação.

---

## Arquitetura e funcionamento

O processamento é realizado no navegador do utilizador. De forma simplificada, o fluxo de execução é o seguinte:

1. A câmara capta o vídeo do utilizador.
2. O MediaPipe Holistic processa os fotogramas e extrai os pontos articulares das mãos e do corpo.
3. O sistema normaliza as coordenadas da mão, compensando diferenças de escala, translação e proporção da imagem.
4. A posição da mão é contextualizada relativamente ao corpo, considerando as zonas de articulação.
5. O motor adequado compara a execução com os modelos de referência:
   - Motor estático, para comparar a geometria da mão;
   - Motor dinâmico, para comparar sequências temporais através de DTW.
6. A interface apresenta o resultado e o feedback corretivo no Canvas e nos elementos HTML.

### Zonas corporais

A contextualização espacial considera quatro zonas principais:

- Testa;
- Queixo;
- Peito;
- Abdómen.

Estas zonas são determinadas dinamicamente com base em pontos da pose corporal do utilizador, permitindo adaptar a avaliação às suas proporções.

### Normalização da mão

A geometria da mão é normalizada com base na distância entre o pulso e a base do dedo médio. Desta forma, a comparação com os modelos de referência é menos dependente da distância do utilizador à câmara e da escala da imagem.

### Alinhamento temporal

Nos gestos dinâmicos, o sistema utiliza Dynamic Time Warping (DTW) para comparar sequências que podem ter durações e velocidades diferentes. A segmentação automática evita que o utilizador tenha de indicar manualmente o início e o fim de cada execução.

---

## Estrutura do projeto

A aplicação é constituída por ficheiros HTML, CSS, JavaScript e ficheiros JSON de referência. Com base nos ficheiros e caminhos utilizados pelo código, a organização esperada é semelhante à seguinte:

```text
LGP-Eval/
├── index.html
├── style.css
├── app2.js
├── math.js
├── calibracao.js
├── referencia.js
├── referencia_numeros/
│   └── ... ficheiros JSON dos gestos numéricos
├── referencia_letras/
│   └── ... ficheiros JSON das letras
└── referenciaDTW/
    └── base_dados_dinamica.js
```

> **Nota:** a árvore acima representa a organização indicada pelas referências existentes no código. Os nomes e a localização dos restantes ficheiros devem ser ajustados caso a estrutura efetiva do repositório seja diferente. O HTML principal deve manter os caminhos relativos corretos para os scripts, folhas de estilo e dados.

### Principais ficheiros

| Ficheiro | Responsabilidade |
|---|---|
| `index.html` | Estrutura da interface, menus, vídeo e Canvas |
| `style.css` | Estilos da aplicação |
| `app2.js` | Inicialização do MediaPipe, ciclo principal, modos da aplicação, segmentação e feedback |
| `math.js` | Operações geométricas e comparação de gestos, incluindo o cálculo DTW |
| `calibracao.js` | Calibração inicial do utilizador |
| `referencia.js` | Carregamento e avaliação dos modelos de gestos estáticos |
| `referenciaDTW/base_dados_dinamica.js` | Base de dados de gestos dinâmicos |

Os modelos estáticos são carregados a partir das pastas `referencia_numeros/` e `referencia_letras/`, através de pedidos `fetch`. Cada referência estática utiliza um ficheiro JSON com a geometria da mão e informação corporal associada.

---

## Requisitos

Para executar a aplicação são necessários:

- Um computador com câmara Web;
- Um navegador moderno com suporte para JavaScript, HTML5 Canvas e acesso à câmara;
- Ligação à Internet para carregar as bibliotecas MediaPipe disponibilizadas pela CDN;
- Permissão de acesso à câmara no navegador.

Recomenda-se a utilização de uma versão recente do Google Chrome ou Microsoft Edge.

---

## Instalação e execução

O LGP-Eval é uma aplicação web do lado do cliente. Não necessita de instalação de dependências através de `npm` nem de um backend para executar os motores de avaliação.

### 1. Clonar o repositório

```bash
git clone <URL_DO_REPOSITORIO>
cd LGP-Eval
```

Substitua `<URL_DO_REPOSITORIO>` pelo endereço do repositório GitHub.

### 2. Iniciar um servidor HTTP local

Como a aplicação carrega ficheiros JSON através de `fetch`, deve ser executada através de um servidor HTTP local, em vez de abrir diretamente o HTML através do protocolo `file://`.

Se tiver Python instalado, pode utilizar:

```bash
python -m http.server 8000
```

### 3. Abrir a aplicação

No navegador, aceda a:

```text
http://localhost:8000
```

Se o ficheiro HTML principal tiver outro nome ou estiver noutra pasta, ajuste o endereço de acordo com a organização do repositório.

### 4. Permitir o acesso à câmara

Quando o navegador solicitar autorização, permita o acesso à câmara. A aplicação necessita desse acesso para detetar as mãos e a pose corporal.

> Se a câmara não iniciar, confirme as permissões do navegador, verifique se está a ser utilizada por outra aplicação e consulte a consola de desenvolvimento para identificar eventuais erros.

---

## Como utilizar

1. Abra a aplicação no navegador.
2. Permita o acesso à câmara.
3. Siga as indicações apresentadas para realizar a calibração inicial. O sistema confirma a deteção da mão antes de iniciar a utilização normal.
4. No menu principal, escolha **Aprendizagem** ou **Avaliação**.
5. Na aprendizagem, selecione **Números** ou **Abecedário** e escolha o gesto que pretende praticar.
6. Posicione-se de forma a que a câmara consiga observar a mão e a parte superior do corpo.
7. Acompanhe as indicações visuais e textuais apresentadas durante a execução.
8. No modo de avaliação, execute o gesto e aguarde pelo resultado do reconhecimento.

As opções de visualização disponíveis nas definições permitem controlar individualmente algumas das ajudas visuais.

---

## Dados de referência

O sistema utiliza ficheiros JSON para armazenar os modelos dos gestos estáticos e dinâmicos.

### Referências estáticas

Cada referência estática contém:

- `pontos`: os 21 pontos articulares da mão, normalizados;
- `corpo`: coordenadas corporais utilizadas para contextualizar a zona de articulação.

Podem existir várias versões de referência para o mesmo gesto, permitindo acomodar diferenças naturais na execução.

### Referências dinâmicas

As referências dinâmicas contêm informação sobre a sequência temporal do gesto, organizada em fotogramas. Cada fotograma pode incluir:

- `mao`: geometria normalizada da mão;
- `zona`: zona corporal identificada;
- `corpo`: informação da pose corporal;
- `distRelFace`: distâncias relativas a pontos da face.

A aplicação carrega as referências para memória durante a inicialização, evitando leituras de ficheiros durante a avaliação de cada fotograma.

### Adicionar novos gestos

A aplicação permite exportar localmente novos modelos em JSON. A exportação de uma referência não altera automaticamente a base de dados distribuída no repositório: para disponibilizar o novo gesto a todos os utilizadores, é necessário integrar o ficheiro na pasta correspondente e atualizar, quando aplicável, os dados ou o código responsável pelo carregamento.

Os novos ficheiros devem respeitar exatamente a estrutura de dados esperada pelos motores de avaliação.

---

## Privacidade

O processamento da imagem é realizado localmente no navegador, através do MediaPipe Holistic. O vídeo captado pela câmara não é enviado para um servidor de inferência do projeto.

A aplicação necessita de acesso à câmara para funcionar. As bibliotecas MediaPipe são carregadas a partir de uma CDN externa, mas isso não significa que o fluxo de vídeo seja enviado para essa CDN.

A calibração inicial concluída é guardada no `LocalStorage` do navegador, através da chave `lgp_onboarding_ok`.

---

## Validação

O sistema foi sujeito a testes com utilizadores finais, com o objetivo de avaliar a experiência de utilização e a adequação da ferramenta enquanto apoio à aprendizagem autónoma da LGP.

Na avaliação de usabilidade, o LGP-Eval obteve uma pontuação média de **89,3 na escala System Usability Scale (SUS)**, resultado classificado no relatório como de excelência.

A avaliação incluiu também observações práticas e qualitativas sobre a utilização da plataforma.

---

## Limitações e trabalho futuro

O relatório identifica oportunidades de evolução, nomeadamente:

- Aumentar e diversificar a base de dados de gestos de referência;
- Melhorar a escalabilidade do armazenamento, considerando carregamento a pedido (*lazy loading*) ou bases de dados locais otimizadas;
- Alargar a validação a mais utilizadores e contextos de utilização;
- Continuar a melhorar os mecanismos de avaliação e o feedback pedagógico.

A base de dados atual é carregada para memória durante a inicialização. Esta opção favorece a rapidez da avaliação em tempo real, mas o consumo de memória aumenta com a dimensão do conjunto de referências.

---

## Autores

Projeto desenvolvido por:

- **Rodrigo Neves** — 51452
- **Diogo Santiago** — 51998

**Licenciatura em Engenharia Informática e Multimédia (LEIM)**  
Instituto Superior de Engenharia de Lisboa (ISEL)  
Unidade Curricular: Projeto  
Ano letivo: 2025/2026

## Orientação

- Professor Doutor Pedro Mendes Jorge
- Professor Tiago Gonçalves
