# LGPEval
A Língua Gestual Portuguesa (LGP) é uma competência vital para profissionais de primeira linha (como enfermeiros, polícias ou bombeiros) no atendimento inclusivo. Contudo, a aprendizagem formal de LGP carece de ferramentas de treino com feedback corretivo em tempo real e de baixo custo computacional. Os atuais modelos generativos de IA e Transformers atuam como "caixas pretas", sendo excelentes para a tradução de fluência, mas ineficazes para identificar, explicar e corrigir falhas geométricas exatas a alunos iniciantes.
Este projeto propõe o desenvolvimento do LGP-Eval, um sistema web determinístico focado na avaliação cinemática de gestos da LGP. O objetivo não é traduzir comunicação contínua, mas sim avaliar rigorosamente a execução mecânica de gestos isolados através de geometria espacial, fornecendo feedback instantâneo ao utilizador sobre a posição dos seus dedos e mãos.
A arquitetura do sistema é estritamente desacoplada (Cliente-Servidor):
•	O Frontend (Motor Biométrico): Utiliza JavaScript e a biblioteca Google MediaPipe (via WebAssembly) para extrair as coordenadas espaciais das mãos a 30fps de forma puramente local. A validação do gesto é feita através de heurísticas matemáticas (cálculo de distâncias e ângulos 2D) implementadas com o padrão de desenho Strategy. Esta abordagem garante latência zero e 100% de privacidade, uma vez que o fluxo de vídeo nunca é transmitido pela rede.
•	O Backend (Gestão e Telemetria): Consiste numa API RESTful desenvolvida em Python (FastAPI) e numa base de dados relacional (SQL).O servidor é "cego" ao vídeo, que gere exclusivamente a autenticação de utilizadores, a lista de gestos e a telemetria das sessões de treino para análise posterior de desempenho.
O objetivo final é criar uma prova de conceito funcional que avalie com sucesso um conjunto selecionado de gestos estáticos e dinâmicos, provando a viabilidade da avaliação geométrica na web.
Devem ser estudados os seguintes aspetos de implementação (entre outros):
•	Tipo de arquitetura: Cliente-Servidor com processamento "edge" no browser.
•	Padrões de Desenho de Software: Strategy e State.
•	Heurísticas matemáticas e geometria aplicadas à Visão Computacional.
•	Construção e consumo de APIs RESTful assíncronas (JSON/Fetch API).
