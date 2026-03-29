# 🚀 Slicer.io - Sprite Slicer & VFX Animation Tool

![Slicer.io Beta](https://img.shields.io/badge/Status-BETA-amber)
![License](https://img.shields.io/badge/License-MIT-emerald)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)

**Slicer.io** é uma ferramenta de alta performance baseada em navegador, projetada para desenvolvedores de jogos e artistas de pixel. Ela simplifica o processo de recortar folhas de sprites (sprite sheets), converter vídeos em frames e configurar animações complexas, sendo ideal para motores que utilizam Sprites e Frames (como Mugen, Unity 2D, Godot, Construct, etc.).

---

## ✨ Funcionalidades Principais

### 🤖 Detecção Inteligente (Smart Split)
- **Auto-Detecção:** Algoritmo avançado de análise de pixels para identificar e recortar sprites automaticamente.
- **VFX Split:** Modo especializado para efeitos e magias, capaz de separar partículas e brilhos com alta precisão.
- **Detecção de Fundo Robusta:** Varredura em grade (grid sampling) para identificar a cor de fundo real, ignorando bordas ou títulos.

### 🎬 Animação e Preview
- **Preview em Tempo Real:** Visualize suas animações instantaneamente com controle de velocidade (FPS).
- **Modo VFX (Blend Mode):** Simulação de brilho usando o modo de mesclagem "Screen/Additive", ideal para testar como os efeitos ficarão no motor de jogo.
- **Onion Skin:** Visualize o frame anterior e o próximo para garantir a fluidez do movimento.

### 🛠️ Configuração de Animação (JSON Metadata)
- **Tipos de Animação:** Categorização automática (Idle, Run, Jump, Spindash, Attack, Hurt, VFX).
- **Pivôs Automáticos:** Cálculo inteligente do ponto de pivô Y baseado no tipo de animação (ex: pés para corrida, centro para pulos/efeitos).
- **Nome do Personagem:** Campo opcional para organizar exportações por herói ou inimigo.

### 📤 Exportação e Persistência
- **JSON Metadata:** Exportação de metadados prontos para uso em motores como Unity, Godot ou Construct.
- **GIF Animado:** Gere GIFs de alta qualidade com transparência preservada.
- **Atlas de Sprites:** Reorganize e baixe sua folha de sprites otimizada.
- **Salvamento Local (.slicer):** Salve seu progresso e configurações de linha para continuar depois.

---

## 🛠️ Stack Técnica

- **Frontend:** React 18, TypeScript, Vite.
- **Estilização:** Tailwind CSS (Mobile-first).
- **Animações:** Motion (framer-motion).
- **Processamento de Imagem:** Canvas API (manipulação de pixels em tempo real).
- **Codificação de GIF:** `gifenc`.
- **Persistência:** `localforage` (IndexedDB).
- **Ícones:** Lucide React.

---

## 🚀 Como Usar

1. **Upload:** Arraste uma imagem ou um vídeo curto (5-30s).
2. **Recorte:** Use o botão "Auto-Detectar Sprites" ou a ferramenta de "Corte Manual" para isolar a área desejada.
3. **Refine:** Ajuste a "Tolerância" para ignorar marcas d'água ou ruídos de compressão.
4. **Configure:** Defina o tipo de animação e o nome da linha no painel lateral.
5. **Preview:** Ative o "VFX Mode" se estiver trabalhando com efeitos para ver o brilho real.
6. **Exportar:** Baixe o JSON ou o GIF final.

---

## 📄 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

---

Criada com ⚡ por **Michel André L. Da Silva** com o apoio da **IA Gemini**.
*Objetivo: Tornar a criação de animações baseadas em Sprites e Frames mais simples e acessível para todos.*
