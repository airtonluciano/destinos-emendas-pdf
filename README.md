# Destinos para Emendas em PDF

Um aplicativo gráfico desktop desenvolvido em Python para automatizar a criação de "Destinos Nomeados" (Named Destinations) em arquivos PDF.
Ideal para catalogar e indexar emendas e subemendas parlamentares, permitindo a substituição visual inteligente de títulos dentro do documento e a exportação final otimizada.

## Funcionalidades Principais
* **Criação de Destinos Nomeados**: Adição rápida de bookmarks ocultos no PDF para indexação.
* **Substituição Visual Categórica (Redaction)**: Substituição física do texto original no documento por um texto formatado dinâmico. A ferramenta apaga canonicamente os textos do código binário do PDF usando intersecção geométrica antes de escrever o texto novo centralizado.
* **Automação de Nomenclaturas**: Sequenciamento numérico inteligente de Emendas e Subemendas baseadas na comissão (ex: CMA, CESP).
* **Interface Responsiva**: Renderização rápida em PyQt6 de PDFs densos.

## Como Usar

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

---

## Preparando o Ambiente e Compilando

O código foi projetado para Python 3.12+ utilizando `PyQt6` para a interface e `PyMuPDF` (`fitz`) para o processamento aprofundado das streams do PDF.

### 1. Preparação (Linux e Windows)
Trabalhe sempre num ambiente virtual (`.venv`) isolado:

```bash
# Clone o repositório
git clone https://github.com/airtonluciano/destinos-emendas-pdf.git
cd destinos-emendas-pdf

# Crie e ative o ambiente virtual
python -m venv .venv

# No Linux:
source .venv/bin/activate
# No Windows (Prompt de Comando):
.venv\Scripts\activate

# Instale as bibliotecas necessárias
pip install -r requirements.txt
```

> **Aviso de SO para Linux**: Como o PyQt6 interage diretamente com o renderizador de janelas, sistemas Linux muito "limpos" (sem desktop components completos) podem exigir a instalação nativa do driver de cursor do X11: `sudo apt install libxcb-cursor0`. No Windows, isso não é necessário, pois as DLLs do Windows API já estão presentes no sistema de todo mundo.

### 2. Compilando o Executável Autossuficiente (Build)
Para produzir um executável que possa ser distribuído e executado por outras pessoas com "dois cliques" sem que elas precisem instalar o Python, utilizamos o `PyInstaller`.

Para facilitar, incluímos um script `build.py` que já ajusta os parâmetros invisíveis, ícone (`hand-point.png`) e empacotamento em janela única. Com o seu `.venv` ativado, apenas rode:

```bash
python build.py
```

O resultado aparecerá dentro da pasta `dist/` como um arquivo único (`DestinosPDF.exe` no Windows, ou `DestinosPDF` no Linux). 

### 3. Releases Estáveis e Verificação de Segurança (Hashes)
Versões autossuficientes já compiladas e prontas para uso estão contidas na pasta `/releases` (separadas por `linux` e `windows`).

Para garantir que o arquivo não foi corrompido durante o download e que é exatamente a versão oficial estável, disponibilizamos arquivos `.sha256.txt` junto aos executáveis contendo a assinatura de Hash original.

**Como conferir a integridade do executável (Hash SHA-256):**

**No Linux:**
Abra o terminal na pasta `releases/linux` e digite:
```bash
sha256sum -c DestinosPDF.sha256.txt
```
*Se estiver correto, a saída será `DestinosPDF: OK`.*

**No Windows:**
Abra o PowerShell na pasta `releases\windows` e digite:
```powershell
Get-FileHash DestinosPDF.exe | Format-List
```
Compare o valor de `Hash` exibido na tela com a sequência de letras e números que está dentro do arquivo `DestinosPDF.exe.sha256.txt`. Se forem idênticos, o arquivo é seguro e íntegro!
