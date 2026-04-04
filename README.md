# 🚀 Slicer.io - Sprite Slicer & 3D Action Generator

![Slicer.io Beta](https://img.shields.io/badge/Status-BETA-amber)
![License](https://img.shields.io/badge/License-MIT-emerald)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat&logo=tailwind-css&logoColor=white)

**Slicer.io** é uma ferramenta de alta performance baseada em navegador, projetada para desenvolvedores de jogos e artistas de pixel. Ela simplifica o processo de recortar folhas de sprites, converter vídeos em frames e configurar animações complexas, além de agora incluir suporte para geração de scripts de ação 3D para Unity.

---

## ✨ Funcionalidades Principais

### 🎞️ Modo Sprite (Estável)
O coração do Slicer.io. Transforme vídeos curtos (5 a 30 segundos) em folhas de sprites prontas para uso.
- **Como funciona:** O usuário faz upload de um vídeo, e o Slicer.io processa automaticamente, extraindo os frames e convertendo-os em um Sprite Sheet otimizado com transparência preservada.
- **Detecção Inteligente:** Algoritmo avançado de análise de pixels para identificar e recortar sprites automaticamente.
- **Exportação:** JSON Metadata pronto para motores como Unity, Godot ou Construct.

### 🎮 Modo 3D & Gerador de Scripts (Híbrido) [BETA 🚧]
Focado em gerar e **personalizar** scripts C# profissionais para Unity utilizando Inteligência Artificial.

- **Status:** Beta. A geração e personalização de scripts é totalmente suportada em C# (Unity). Suporte para JavaScript (Three.js) está em fase de testes.
- **Nova Geração com IA (Gemini API):** O gerador agora utiliza o modelo **Gemini 3.1 Flash** via API. Isso garante respostas instantâneas, personalização inteligente através de linguagem natural e **zero consumo de memória** no seu dispositivo (ideal para uso mobile!).
- **Objetivo:** Facilitar a criação de controladores de personagens 3D robustos, permitindo que você peça alterações no código como "Mude a tecla de corrida para RightCtrl" e a IA faça o trabalho pesado.

---

## 🛠️ Biblioteca de Scripts Base (Modo 3D)

Nossa IA utiliza uma biblioteca de scripts C# profissionais como base para personalização, todos com foco em performance e boas práticas:

- **WalkAction3D:** Movimentação base sólida.
- **JumpAction3D:** Pulo com física correta, gravidade e estados de animação (`isJumping`/`isFalling`).
- **CrouchAction3D:** Agachamento com ajuste dinâmico de collider.
- **DamageAction3D:** Sistema de vida completo com `TakeDamage` e proteção de HP.
- **AttackAction3D:** Ataque com cooldown configurável e dano.
- **VFXScenarioAction3D:** Efeitos visuais otimizados com gerenciamento de memória (`Destroy`).

*Todos os scripts incluem `[RequireComponent(typeof(Animator))]` e `Debug.LogWarning` para facilitar o uso no Inspector.*

---

## 🚀 Como Usar
### Modo Sprite
1. **Upload:** Arraste uma imagem ou um vídeo curto (5-30s).
2. **Recorte:** Use o botão "Auto-Detectar Sprites" ou a ferramenta de "Corte Manual".
3. **Refine:** Ajuste a "Tolerância" para ignorar marcas d'água ou ruídos.
4. **Configure:** Defina o tipo de animação e o nome da linha.
5. **Preview:** Ative o "VFX Mode" se estiver trabalhando com efeitos.
6. **Exportar:** Baixe o JSON ou o GIF final.

### Modo Gerador 3D (Beta)
1. **Escolha o Script:** Selecione a ação base que deseja (ex: WalkAction3D).
2. **Personalize:** Digite o que deseja alterar no código (ex: "Adicione um pulo duplo").
3. **Gere com IA:** Clique em "Personalizar com IA" e aguarde a mágica do Gemini.
4. **Copie ou Baixe:** Copie o código gerado ou baixe diretamente o arquivo `.cs`.

---

## 📄 Licença

Este projeto está licenciado sob a Licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

---

Criada com ⚡ por **Michel André L. Da Silva** com o apoio da **IA Gemini**.
*Objetivo: Tornar a criação de animações baseadas em Sprites e Frames mais simples e acessível para todos.*

**Acesse a ferramenta:** [Slicer.io](https://ais-pre-6mcjunedilc3ifswrkn2zp-514173459659.us-east1.run.app)
