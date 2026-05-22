/**
 * Motor de Processamento de PDF usando pdf-lib
 * Roda inteiramente no lado do cliente (Client-Side)
 */

// --- HELPER FUNCTIONS FOR RAW PDF CONTENT STREAM MANIPULATION ---

function getCommissionName(text) {
  if (!text) return null;
  const match = text.match(/(?:-|–|—|\s)\s*([A-Z]{2,5})\b/);
  if (match) return match[1];
  // Fallback: last word
  const words = text.trim().split(/\s+/);
  if (words.length > 0) {
    const last = words[words.length - 1].replace(/[^A-Za-z]/g, '');
    if (last.length >= 2) return last;
  }
  return null;
}

function numberToHex(numStr) {
  // Filtra apenas os dígitos (para lidar com pontos de subemendas e outros caracteres)
  const cleanStr = numStr.replace(/[^0-9]/g, '');
  let hex = '';
  for (const d of cleanStr) {
    const gid = 19 + parseInt(d, 10);
    const gidHex = gid.toString(16).padStart(4, '0');
    hex += gidHex;
  }
  return hex;
}

function unescapePdfString(pdfStr) {
  return pdfStr.replace(/\\([0-7]{3})/g, (match, octal) => {
    return String.fromCharCode(parseInt(octal, 8));
  }).replace(/\\(.)/g, '$1');
}

function bytesToString(bytes) {
  let str = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    str += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return str;
}

function stringToBytes(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

export async function executePdfModifications({
  pdfBytes,
  replacements,
  destinations
}) {
  const { PDFDocument, PDFName, PDFString, PDFDict, PDFArray, PDFRef, PDFRawStream, rgb, StandardFonts } = PDFLib;

  // 1. Carregar o documento PDF original
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  // 2. Incorporar a fonte Times-Roman-Bold para as emendas (combina com a fonte Serif original do Senado)
  const font = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  // 3. Remover Fisicamente o Texto Original dos Content Streams (Verdadeira Redação para IAs e Leitores)
  const pagesWithReplacements = {};
  for (const rep of replacements) {
    if (!pagesWithReplacements[rep.pageIndex]) {
      pagesWithReplacements[rep.pageIndex] = [];
    }
    pagesWithReplacements[rep.pageIndex].push(rep);
  }

  for (const pageIdxStr of Object.keys(pagesWithReplacements)) {
    const pageIndex = parseInt(pageIdxStr);
    const reps = pagesWithReplacements[pageIndex];
    const page = pdfDoc.getPage(pageIndex);
    
    // Obter o objeto /Contents da página
    const contents = page.node.get(PDFName.of('Contents'));
    if (!contents) continue;
    
    // Obter array de referências de streams de conteúdo
    let streamRefs = [];
    if (contents instanceof PDFRef) {
      streamRefs = [contents];
    } else if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        streamRefs.push(contents.get(i));
      }
    }
    
    for (const ref of streamRefs) {
      const stream = pdfDoc.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) continue;
      
      const rawBytes = stream.contents;
      let decompressedBytes = rawBytes;
      
      // Verificar se é FlateDecode
      const filter = stream.dict.get(PDFName.of('Filter'));
      let isFlate = false;
      if (filter === PDFName.of('FlateDecode')) {
        isFlate = true;
      } else if (filter instanceof PDFArray) {
        for (let i = 0; i < filter.size(); i++) {
          if (filter.get(i) === PDFName.of('FlateDecode')) {
            isFlate = true;
            break;
          }
        }
      }
      
      if (isFlate) {
        try {
          // pako é carregada a partir do CDN na index.html
          decompressedBytes = pako.inflate(rawBytes);
        } catch (e) {
          console.warn(`[PWA Redact] Falha ao descompactar stream da pág ${pageIndex + 1}:`, e);
          continue;
        }
      }
      
      // Converter para latin1 string para edição binária segura
      let streamStr = bytesToString(decompressedBytes);
      let wasModified = false;
      
      // A. Remoção Robusta de Blocos de Emenda (tanto CID-hex quanto ASCII)
      for (const rep of reps) {
        if (!rep.originalText) continue;
        
        // Obter número da emenda (ex: "EMENDA Nº 12 - CMA" -> "12")
        const numMatch = rep.originalText.match(/(?:Nº|nº|NO|No|N)\s*(\d+(?:\.\d+)?)/i);
        const emendaNum = numMatch ? numMatch[1] : '';
        const oldComm = getCommissionName(rep.originalText);
        
        if (emendaNum && oldComm) {
          // Converter número da emenda em sequência hex CID
          const hexDigits = numberToHex(emendaNum);
          
          // Regex para bloco CID-hex
          const cidBlockRegex = new RegExp(
            `(\\((?:EMENDA|SUBEMENDA)[^)]*\\))([\\s\\S]{1,250}?)<([0-9a-fA-F]*` + hexDigits + `[0-9a-fA-F]*)>([\\s\\S]{1,250}?)(\\([^)]*` + oldComm + `[^)]*\\))`,
            'gi'
          );
          
          if (cidBlockRegex.test(streamStr)) {
            streamStr = streamStr.replace(cidBlockRegex, (blockMatch) => {
              wasModified = true;
              console.log(`[PWA Redact] Bloco CID-hex da Emenda ${emendaNum} - ${oldComm} expurgado com sucesso!`);
              return blockMatch.replace(/\(([^)]*)\)/g, (m, content) => {
                return '(' + ' '.repeat(content.length) + ')';
              }).replace(/<([0-9a-fA-F]*)>/g, (m, hexContent) => {
                const numChars = Math.floor(hexContent.length / 4);
                return '<' + '0003'.repeat(numChars) + '>';
              });
            });
          } else {
            // Fallback para bloco ASCII
            const asciiBlockRegex = new RegExp(
              `(\\((?:EMENDA|SUBEMENDA)[^)]*\\))([\\s\\S]{1,150}?)(\\([^)]*` + emendaNum + `[^)]*\\))([\\s\\S]{1,150}?)(\\([^)]*` + oldComm + `[^)]*\\))`,
              'gi'
            );
            if (asciiBlockRegex.test(streamStr)) {
              streamStr = streamStr.replace(asciiBlockRegex, (blockMatch) => {
                wasModified = true;
                console.log(`[PWA Redact] Bloco ASCII da Emenda ${emendaNum} - ${oldComm} expurgado com sucesso!`);
                return blockMatch.replace(/\(([^)]*)\)/g, (m, content) => {
                  return '(' + ' '.repeat(content.length) + ')';
                });
              });
            }
          }
        }
      }
      
      // B. Salvaguarda Secundária por Token Individual
      // ATENÇÃO: os critérios abaixo são deliberadamente conservadores para evitar
      // "colateral" em títulos vizinhos que compartilham palavras como "EMENDA".
      // Só apaga um token se ele representar >= 70% do texto original redacionado.
      const newStreamStr = streamStr.replace(/\(([^)]*)\)/g, (match, content) => {
        const unescaped = unescapePdfString(content);
        
        let shouldBlank = false;
        for (const rep of reps) {
          if (!rep.originalText) continue;
          
          const cleanOrig = rep.originalText.replace(/\s+/g, '').toUpperCase();
          const cleanUnescaped = unescaped.replace(/\s+/g, '').toUpperCase();
          
          // O token deve cobrir pelo menos 70% do texto original para ser apagado
          const minLength = Math.max(8, Math.floor(cleanOrig.length * 0.7));
          
          if (cleanOrig.includes(cleanUnescaped) && cleanUnescaped.length >= minLength) {
            shouldBlank = true;
            break;
          }
          if (cleanUnescaped.includes(cleanOrig) && cleanUnescaped.length >= minLength) {
            shouldBlank = true;
            break;
          }
        }
        
        if (shouldBlank) {
          wasModified = true;
          // Sobrescrever com espaços do mesmo comprimento exato
          return '(' + ' '.repeat(content.length) + ')';
        }
        return match;
      });
      
      streamStr = newStreamStr;
      
      // 2. Substituir textos em strings hexadecimais: <hex>
      const finalStreamStr = streamStr.replace(/<([0-9a-fA-F]*)>/g, (match, hexContent) => {
        if (hexContent.length % 2 !== 0) return match;
        
        let unescaped = '';
        for (let i = 0; i < hexContent.length; i += 2) {
          unescaped += String.fromCharCode(parseInt(hexContent.substr(i, 2), 16));
        }
        
        let shouldBlank = false;
        for (const rep of reps) {
          if (!rep.originalText) continue;
          
          const cleanOrig = rep.originalText.replace(/\s+/g, '').toUpperCase();
          const cleanUnescaped = unescaped.replace(/\s+/g, '').toUpperCase();
          
          const minLength = Math.max(8, Math.floor(cleanOrig.length * 0.7));
          
          if (cleanOrig.includes(cleanUnescaped) && cleanUnescaped.length >= minLength) {
            shouldBlank = true;
            break;
          }
          if (cleanUnescaped.includes(cleanOrig) && cleanUnescaped.length >= minLength) {
            shouldBlank = true;
            break;
          }
        }
        
        if (shouldBlank) {
          wasModified = true;
          // Sobrescrever com espaços em hex (20) do mesmo comprimento exato
          return '<' + '20'.repeat(hexContent.length / 2) + '>';
        }
        return match;
      });
      
      streamStr = finalStreamStr;
      
      if (wasModified) {
        const modifiedBytes = stringToBytes(streamStr);
        let finalBytes = modifiedBytes;
        if (isFlate) {
          try {
            finalBytes = pako.deflate(modifiedBytes);
          } catch (e) {
            console.error(`[PWA Redact] Falha ao re-compactar stream da pág ${pageIndex + 1}:`, e);
            continue;
          }
        }
        
        // Atualizar o stream no PDF
        stream.contents = finalBytes;
        stream.dict.set(PDFName.of('Length'), pdfDoc.context.obj(finalBytes.length));
        console.log(`[PWA Redact] Texto original arrancado com sucesso da pág ${pageIndex + 1}!`);
      }
    }
  }

  // 4. Aplicar Substituições Visuais (Redactions / Overlay de Novo Texto)
  for (const rep of replacements) {
    const { pageIndex, rect, newText } = rep;
    const upperText = newText.toUpperCase();
    const page = pdfDoc.getPage(pageIndex);
    const pageHeight = page.getHeight();
    
    // Obter dimensões do PDF e fazer conversão de coordenadas:
    // PDF.js / Visualizador trabalha com origem no canto superior-esquerdo (Y aumenta para baixo).
    // pdf-lib trabalha com origem no canto inferior-esquerdo (Y aumenta para cima).
    const pdfX = rect.x;
    const pdfY = pageHeight - rect.y - rect.height; // Ajuste para origem inferior
    const pdfWidth = rect.width;
    const pdfHeight = rect.height;

    // Desenhar retângulo branco sobre o texto anterior
    // Aumentamos a margem vertical de segurança de 1pt para 2pt no desenho físico para cobrir a fonte
    page.drawRectangle({
      x: pdfX - 1.5,
      y: pdfY - 2,
      width: pdfWidth + 3,
      height: pdfHeight + 4,
      color: rgb(1, 1, 1), // Branco sólido
    });

    // Centralizar o novo título horizontalmente em relação à página inteira
    const textWidth = font.widthOfTextAtSize(upperText, 14);
    const pageWidth = page.getWidth();
    const centerX = pageWidth / 2;
    const startX = centerX - (textWidth / 2);
    
    // Alinhar baseline verticalmente
    const yBaseline = pdfY + (pdfHeight * 0.25);

    // Escrever o novo título
    page.drawText(upperText, {
      x: startX,
      y: yBaseline,
      size: 14,
      font: font,
      color: rgb(0, 0, 0), // Preto
    });
  }

  // 5. Injetar Destinos Nomeados (Named Destinations) no Catálogo do PDF
  const destKeys = Object.keys(destinations);
  if (destKeys.length > 0) {
    // A especificação PDF exige que a árvore de nomes (Name Tree) esteja em ordem alfabética.
    const sortedKeys = [...destKeys].sort((a, b) => a.localeCompare(b));
    
    const namesArray = [];
    const context = pdfDoc.context;

    for (const key of sortedKeys) {
      const destData = destinations[key];
      const pageIndex = destData.page;
      const yCoord = destData.y; // Coordenada Y em pontos da página (medida do topo da página)
      
      const page = pdfDoc.getPage(pageIndex);
      const pageHeight = page.getHeight();
      
      // Converter coordenada Y do topo da página (PDF.js) para a origem na base (pdf-lib)
      const pdfY = pageHeight - yCoord;

      // Criar array de destino: [pageRef, 'XYZ', x, y, zoom]
      // XYZ define que pula para coordenada X e Y mantendo o zoom atual.
      const destArray = context.obj([
        page.ref,
        PDFName.of('XYZ'),
        0,       // Mantém X na extrema esquerda
        pdfY,    // Altura da emenda convertida
        0        // Mantém zoom atual
      ]);

      // A chave no Name Tree deve ser uma string de PDF (PDFString)
      namesArray.push(PDFString.of(key));
      namesArray.push(destArray);
    }

    // Criar o dicionário folha da Árvore de Nomes
    const leafDict = context.obj({
      Names: namesArray
    });
    // Registrar o objeto indireto no PDF e obter sua referência
    const leafRef = context.register(leafDict);

    // Acessar ou criar a entrada /Names no catálogo do PDF
    if (!pdfDoc.catalog.has(PDFName.of('Names'))) {
      pdfDoc.catalog.set(PDFName.of('Names'), context.obj({}));
    }
    const namesDict = pdfDoc.catalog.lookup(PDFName.of('Names'), PDFDict);

    // Associar o Name Tree de destinos na chave /Dests de /Names
    namesDict.set(PDFName.of('Dests'), leafRef);
  }

  // 6. Salvar e retornar os bytes modificados
  const modifiedPdfBytes = await pdfDoc.save();
  return modifiedPdfBytes;
}
