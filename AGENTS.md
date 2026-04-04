# 🤖 Relatório de Atualização de IA (AI Update Report)
**Data:** 04 de Abril de 2026
**Projeto:** Slicer.io
**Módulo:** Gerador de Scripts 3D (Híbrido)

---

## 🚨 Resumo Crítico para Agentes de IA
Este documento serve como registro de arquitetura e diretriz para futuras IAs que trabalharem neste projeto. O módulo de Geração 3D passou por uma refatoração arquitetural crítica para resolver problemas de **Out of Memory (OOM)** em dispositivos móveis.

## 🐛 O Problema Anterior (Contexto Histórico)
A implementação inicial do `CodeGeneratorPanel` utilizava a biblioteca `@xenova/transformers` para rodar modelos LLM localmente no navegador do usuário via WebAssembly (WASM).
- **Modelo Tentado 1:** `Xenova/gemma-2b-it` (~1.7GB). Falhou devido a restrições de acesso (Gated Model no HuggingFace) resultando em erro `401 Unauthorized`.
- **Modelo Tentado 2:** `Xenova/Qwen1.5-0.5B-Chat` (~350MB). Funcionou no Desktop, mas causou o erro "Aw, Snap!" (Crash da aba por falta de memória) em navegadores mobile (Chrome Android/iOS) devido aos limites rígidos de RAM por aba.

## 🛠️ A Nova Arquitetura (Atual)
A abordagem de inferência local (Client-Side AI) foi **totalmente abandonada** para este módulo.

A arquitetura atual utiliza **Inferência em Nuvem via API (Server-Side AI)**:
1. **Provedor:** Google Gemini API (`@google/genai`).
2. **Modelo:** `gemini-3.1-flash-preview` (Escolhido por sua velocidade e capacidade de codificação).
3. **Autenticação:** A chave da API (`process.env.GEMINI_API_KEY`) é injetada automaticamente pelo ambiente do Google AI Studio. **NÃO** crie interfaces para o usuário inserir chaves.

### 📂 Arquivos Modificados
- `/src/utils/codeGenerator.ts`: Removido o `@xenova/transformers`. Implementado o `GoogleGenAI`. A função `loadModel` agora apenas simula um delay para feedback visual de UI. A função `customizeCode` faz a chamada real para a API do Gemini.
- `/src/components/CodeGeneratorPanel.tsx`: Atualizados os textos de UI para refletir o uso da API e o consumo zero de memória. Corrigido o layout responsivo (flex-col no mobile, flex-row no desktop) e adicionado `shrink-0` no textarea para evitar esmagamento.
- `/vite.config.ts`: Removidas as exclusões de otimização relacionadas ao `@xenova/transformers`.
- `/README.md`: Atualizado para refletir o status Beta e o uso da Gemini API.

## ⚠️ Diretrizes Estritas para Futuras Modificações
1. **NÃO REVERTA PARA MODELOS LOCAIS:** Sob nenhuma circunstância tente reintroduzir modelos LLM rodando no navegador (via transformers.js, web-llm, etc) para a geração de código. O ambiente alvo inclui dispositivos móveis de baixo custo que não suportam essa carga.
2. **Mantenha o Prompt de Sistema:** O `systemInstruction` em `codeGenerator.ts` está configurado para forçar a saída estrita de código C# sem formatação markdown. Se for adicionar suporte a Three.js (JavaScript), crie uma lógica condicional para alterar o `systemInstruction` com base na linguagem selecionada.
3. **Layout Mobile-First:** O painel esquerdo (inputs) e o direito (código) devem rolar verticalmente no mobile, e não tentar caber na mesma tela (o que esmaga os elementos).

---
*Fim do Relatório. Siga estas diretrizes para manter a estabilidade do Slicer.io.*
