# 🚀 Slicer.io - Advanced Sprite Slicer & 2D Fighting Game Studio

![Slicer.io Beta](https://img.shields.io/badge/Status-BETA-amber)
![License](https://img.shields.io/badge/License-MIT-emerald)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)

**Slicer.io** é uma poderosa ferramenta web de alta performance desenhada para desenvolvedores indies, focada em tornar a animação fluida para jogos 2D/3D (MUGEN, Unity, Godot) uma experiência acessível e espetacular. Transforme recursos visuais (vídeos, GIFs, estáticos) em Data Sheets compactos e completos em questão de segundos. 

---

## ✨ Funcionalidades Principais (Atualizado 2026)

### 🎞️ Visão Média: Importação Universal & Sprite Editor
Transforme o bruto em utilizável com nosso extrator via Browser.
- **Suporte Multimídia Absoluto:** Importar imagens estáticas, Gifs densos ou converter Vídeos em MP4 de 5-30s com extração a Frame Completo `(A tela pode piscar durante extrações de vídeo pesado, isso não afetará o framerate na exportação!)`.
- **Janelas Mescladas (Multi-Cropping):** Exporte a limpeza do background recortando vários segmentos da imagem original e unificando como um novo Canvas mestre.
- **Algoritmo Auto-Detect:** Detecta recortes perfeitamente sem input manual com ignorar fundo, keyframes, unindo pedaços flutuantes via Threshold (`Merge Distance`).
- **Clean e Refine:** Tolerância em tempo real à chroma-key (verdes, brancos) ou supressões manuais.

### ⚔️ Evolution Studio (Combat Arena & Hitboxes)
O maior pulo tecnológico: O seu editor de Combate que fica totalmente visível!
- **Studio de Organização por Linha:** Suas imagens são cortadas logicamente e ordenadas horizontalmente. Cada linha agora carrega uma inteligência de Move Action (p.ex., Ataque Especial).
- **Editor de Colisões Interativo (Caixas de Combate):** Abra qualquer frame individual do seu "Soco" e arraste retângulos com o cursor. Defina **Hitboxes** (vermelhos - onde hita) e **Hurtboxes** (verdes - corpo defensivo do jogador) isoladamente. Totalmente suportado pela exportação de Metadata JSON.
- **Configurador de Ações (Attack/Idle/Move/Damage):** Atrele configurações detalhadas para o input key (ex: `J`, `W`), velocidade escalar, Pivôs nativos e quadros-gatilho de Porrada/Dano.

### 🎮 Arena Sandbox Ao Vivo
Não baixe para testar se ficou fluido.
- Teste e pressione as teclas do mapeamento diretamente pro motor. A UI inclui feedbacks de Tela de Impacto (Screen Shakes, Flashes Brancos, Exibição de hit de `Dano -99` Flutuante em Canvas), mais Som SFX Integrado das Porradas (`POW!` Retro ou Espadas). Tudo simulando a sensação em runtime do Game-Loop!

### 📦 Motor de Exportação Unificado
Traga a extração de forma isolada sem sobrecarga técnica.
- **Modularidade de Linhas:** Exportar a classe "Hit 2" numa varredura Isolada no `.ZIP` se você não quis mexer nos frames dos outros attacks.
- **JSON + C# Controller nativo:** O Zip global manda a Unity um C# MonoBehavior Player Controller que sabe automaticamente onde suas animações Hitboxes e Quadros chaves atrelados às teclas do web param de tocar. 

### 🤖 Modo 3D & Gerador Auxiliar (Cloud AI - Gemini API)
Nossa aba de auxílio geracional:
- Integrada ao Modelador **Gemini 3.1 Flash API Server-Side**! Zero lags, zero crashes do WASM Transformer no mobile, totalmente via Rest Call na Nuvem! Você pode solicitar que o Gemini re-escreva `WalkAction3D` para adicionar `Dash-Mecânico`, mantendo suas regras de jogo intactas instantaneamente na interface de Código!

---

## 🚀 Como Usar Rapidamente

1. **Upload:** Arraste e Solte os Gifs ou clipes MP4 de captura. 
2. **Crop & Merge:** Na preview, trace caixas nos sprite sheets visíveis nas rebarbas da tela, feche e pressione "Concluir Recortes" (ideal pra rips com muito HUD em volta).
3. **Deteção Automatizada:** Limpe o background `(Pipeta no verde -> Tolerancia 8%)` e ative *Auto-Detect*.
4. **Ative o [STUDIO - Combat Mode]:** Ajuste os pivôs (ex: Bottom Center), reordene linhas de acões, desenhe Hurtboxes sobre os quadros onde o punho acerta no mini Editor, atribua a tecla SPACE àquela Linha.
5. **Combate Simulativo:** Abra Arena Sandbox e pressione Space. Sinta o impacto na engine do navegador!
6. **Exportar Projeto Global:** Faça o download ZIP para obter a Folha Compactada (.png) e O Metadata File (.json) com `Hurtboxes/Hitboxes/Tempos de Cada frame`.

---

## 📄 Informações de Desenvolvimento

Este projeto está construído modularmente no universo React / Vite e está licenciado sob MIT - veja o arquivo [LICENSE](LICENSE). O App inteiro é PWA Híbrido, garantindo Layout responsivo de telas esticadas (1440p) a compactos celulares para usar até mesmo no iOS.

---

Criada com ⚡ por **Michel André L. Da Silva** e **Agente AI Google DeepMind**.  
*Objetivo Definitivo: Transformar a burocracia do M.U.G.E.N / Unity Sprites Tool em um parque de diversões fluido onde desenhar frames não seja tortura técnica.*

👉 **Acesse:** [Slicer.io (Preview Deploy)](https://ais-pre-6mcjunedilc3ifswrkn2zp-514173459659.us-east1.run.app)
