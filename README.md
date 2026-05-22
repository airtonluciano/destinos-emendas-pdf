# Destinos para Emendas em PDF

Um aplicativo gráfico desktop desenvolvido em Python para automatizar a criação de "Destinos Nomeados" (Named Destinations) em arquivos PDF.
Ideal para catalogar e indexar emendas e subemendas parlamentares, permitindo a substituição visual inteligente de títulos dentro do documento e a exportação final otimizada.

**NOVO:** Agora o projeto inclui uma versão **Web PWA (Progressive Web App)** totalmente client-side, que roda direto no navegador, não requer instalação e funciona offline!

## Estrutura do Projeto

* `desktop/`: Código-fonte, scripts de build e releases da versão Desktop em Python (PyQt6 + PyMuPDF).
* `web/`: Código-fonte estático (HTML, CSS, JS) da versão Web PWA (Vanilla JS + pdf-lib + pdf.js).

---

## 🌐 Versão Web PWA (Zero Backend)

A versão Web roda inteiramente na memória do navegador do usuário. Nenhum dado ou PDF é enviado para a internet, garantindo 100% de privacidade e aderência à LGPD.

### Como Hospedar/Executar
1. **Localmente (Testes):** Navegue até a pasta raiz e inicie um servidor HTTP simples (ex: `python3 -m http.server 8000`), depois acesse `http://localhost:8000/web/index.html`.
2. **Hospedagem Estática:** Pode ser hospedado em qualquer provedor de sites estáticos, como **GitHub Pages**, **Vercel**, **Firebase Hosting**, ou distribuído internamente em um arquivo `.zip`.

### Uso Básico
* Carregue o arquivo e configure a sigla da comissão/emenda.
* Utilize o clique direito (ContextMenu) sobre o visualizador de PDF para adicionar destinos ou substituir textos originais.
* Após a primeira visita online, o aplicativo fica em cache no navegador e pode ser usado sem internet.

---

## 🖥️ Versão Desktop (Python)

A versão Desktop original continua disponível em `/desktop`. Ela utiliza PyQt6 para interface gráfica e acesso robusto e de baixo nível aos streams de PDF.

### Como Usar

1. Clique em **'Abrir PDF'** para carregar o seu documento original.
2. No campo **'Nº da última emenda de membro'**, informe o número da emenda que antecede a que você quer criar (se a próxima deve ser Emenda3, digite 2).
3. No campo **'Sigla para emendas de relator'**, preencha a sigla desejada (ex: CMA). Ela será usada como padrão.
4. No visualizador de PDF (lado direito), role até cada emenda de relator.
5. **Substituir Texto**: Se quiser substituir o título original, clique e **arraste com o botão esquerdo** sobre o texto (ex: 'EMENDA Nº - CMA') para selecioná-lo. Em seguida, clique com o **botão direito** DENTRO da área selecionada. Um modal permitirá confirmar o texto de substituição.
6. **Criar sem substituir**: Apenas clique com o botão direito em qualquer lugar da página.
7. **Selecione** 'Criar destino Emenda#' ou 'Criar destino de Subemenda...'. 
8. Se for o caso, edite o novo título antes de aplicar a substituição.
9. O painel esquerdo ('Destinos Criados') lista todos os destinos. **Clique** neles para pular até aquele ponto no texto.
10. **Clicar com botão direito** em um destino no painel permite excluí-lo.
11. Ao finalizar as marcações, clique em **'Salvar PDF/A (Final)'** para gerar o arquivo com os destinos e textos substituídos.

### Compilação (Linux e Windows)
Trabalhe sempre num ambiente virtual (`.venv`) isolado e navegue até a pasta `desktop/`:

```bash
git clone https://github.com/airtonluciano/destinos-emendas-pdf.git
cd destinos-emendas-pdf/desktop
python -m venv .venv
source .venv/bin/activate  # Ou .venv\Scripts\activate no Windows
pip install -r requirements.txt
python build.py
```
