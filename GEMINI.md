# Arquitetura: Destinos PDF (Web & Desktop)

Este documento descreve a visão de design, arquitetura e infraestrutura implementada para o **Criador de Destinos Nomeados em PDF**. O projeto agora possui duas vertentes: a aplicação Desktop em Python original, e a versão Web PWA (Zero Backend) recém-lançada.

---

## 🚀 Vertente Web PWA (Client-Side)

A versão Web foi construída para superar barreiras corporativas e maximizar a segurança:
1. **Independência de Ambiente (Sem Executáveis):**
   * Redes corporativas com políticas restritivas frequentemente bloqueiam `.exe`. A versão Web roda diretamente no navegador.
2. **Privacidade Absoluta (Zero Backend):**
   * Processamento 100% no navegador (`Client-Side`). Nenhum dado é enviado para servidores. Conformidade total com a LGPD.
3. **Disponibilidade Offline-First:**
   * Utilizando Service Worker com cache versionado, funciona de forma 100% offline após a primeira carga.
4. **Hospedagem Flexível:**
   * Hospedável em GitHub Pages, Firebase, ou distribuído via `.zip` estático.

### 🛠️ Stack Técnica Web
* **Interface e Estilo:** HTML5 semântico, Javascript moderno (ES Modules) e **Vanilla CSS premium** com adaptação a temas claros/escuros (`prefers-color-scheme`).
* **Renderização de PDF:** **PDF.js** (Mozilla).
* **Manipulação e Gravação:** **pdf-lib** para intersecção de streams e manipulação do dicionário `/Names` -> `/Dests`.

---

## 🖥️ Vertente Desktop (Python)

A ferramenta original foi separada para a pasta `/desktop/`. Ideal para usuários com permissões administrativas locais que preferem um software tradicional.

### 🛠️ Stack Técnica Desktop
* **Lógica Core:** Python 3.12+
* **Interface Gráfica:** PyQt6
* **Manipulação de PDF:** PyMuPDF (`fitz`) para remoção em baixo nível (`redaction`) no content stream e injeção de marcadores.
* **Distribuição:** Compilação via PyInstaller (`build.py`) com assinatura e checagem de hashes SHA-256.

---

## 📐 Fluxo Integrado (Aplicável a Ambos)

1. Carregamento de arquivo original.
2. Configuração de parâmetros de nomenclatura sequencial (Ex: `Nº Emenda` e `Comissão`).
3. Navegação e marcação visual com injeção paralela no catálogo `/Dests`.
4. Salvamento seguro produzindo um arquivo sanitizado e indexado perfeitamente compatível com qualquer leitor PDF moderno.
