/**
 * Orquestrador Principal da Aplicação Destinos PDF Web
 */

import { PdfViewer } from './pdf_viewer.js';
import { executePdfModifications } from './pdf_processor.js';

// --- ESTADO GLOBAL DO APLICATIVO ---
const state = {
  pdfBytes: null,
  fileName: '',
  addedDestinations: {}, // nome -> { page, y }
  replacements: [],      // array de { pageIndex, rect, originalText, newText }
  activeSelection: { selected: false },
  activeRightClick: null
};

// --- ELEMENTOS DO DOM ---
const el = {
  fileInput: document.getElementById('fileInput'),
  fileNameDisplay: document.getElementById('fileNameDisplay'),
  viewerContainer: document.getElementById('viewerContainer'),
  pdfViewer: document.getElementById('pdfViewer'),
  
  commissionInput: document.getElementById('commissionInput'),
  lastEmendaInput: document.getElementById('lastEmendaInput'),
  destinationsList: document.getElementById('destinationsList'),
  destCount: document.getElementById('destCount'),
  btnClearAll: document.getElementById('btnClearAll'),
  
  btnZoomIn: document.getElementById('btnZoomIn'),
  btnZoomOut: document.getElementById('btnZoomOut'),
  zoomVal: document.getElementById('zoomVal'),
  btnExport: document.getElementById('btnExport'),
  
  contextMenu: document.getElementById('customContextMenu'),
  menuAddEmenda: document.getElementById('menuAddEmenda'),
  menuAddSubemenda: document.getElementById('menuAddSubemenda'),
  menuReplaceText: document.getElementById('menuReplaceText'),
  nextEmendaNumSpans: document.querySelectorAll('.next-emenda-num'),
  
  replaceModal: document.getElementById('replaceModal'),
  replaceForm: document.getElementById('replaceForm'),
  originalTextPreview: document.getElementById('originalTextPreview'),
  newTitleInput: document.getElementById('newTitleInput'),
  chkCreateDest: document.getElementById('chkCreateDest'),

  helpModal: document.getElementById('helpModal'),
  btnHelp: document.getElementById('btnHelp'),
  closeHelp: document.getElementById('closeHelp'),
  btnHelpOk: document.getElementById('btnHelpOk'),

  subemendaModal: document.getElementById('subemendaModal'),
  subemendaForm: document.getElementById('subemendaForm'),
  subemendaOriginalGroup: document.getElementById('subemendaOriginalGroup'),
  subemendaOriginalPreview: document.getElementById('subemendaOriginalPreview'),
  subemendaEmendaNum: document.getElementById('subemendaEmendaNum'),
  subemendaSubNum: document.getElementById('subemendaSubNum'),
  subemendaReplaceGroup: document.getElementById('subemendaReplaceGroup'),
  subemendaNewTitleInput: document.getElementById('subemendaNewTitleInput')
};

// --- INICIALIZADOR DO PDF VIEWER ---
const pdfViewer = new PdfViewer(
  el.pdfViewer,
  // Callback de alteração de seleção
  (selInfo) => {
    state.activeSelection = selInfo;
    if (selInfo.selected) {
      el.menuReplaceText.style.display = 'flex';
    } else {
      el.menuReplaceText.style.display = 'none';
    }
  },
  // Callback de clique com botão direito
  (rightClickInfo) => {
    state.activeRightClick = rightClickInfo;
    showContextMenu(rightClickInfo.x, rightClickInfo.y, rightClickInfo.hasSelection);
  }
);

// --- GERENCIAMENTO DE INTERFACE E EVENTOS ---

// Carregamento de PDF
el.fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  state.fileName = file.name;
  el.fileNameDisplay.textContent = file.name;
  
  // Limpar estados anteriores
  state.addedDestinations = {};
  state.replacements = [];
  pdfViewer.clearAllMarkers();
  updateDestinationsUI();

  // Ler bytes do arquivo
  const reader = new FileReader();
  reader.onload = async (e) => {
    // Alocar uma cópia real e independente do ArrayBuffer para blindagem absoluta contra desalocação
    state.pdfBytes = new Uint8Array(e.target.result.slice(0));
    try {
      el.fileNameDisplay.textContent = `Carregando: ${file.name}...`;
      await pdfViewer.loadPDF(state.pdfBytes.slice(0));
      
      // Carregar destinos existentes do PDF original
      try {
        const dests = await pdfViewer.pdfDoc.getDestinations();
        if (dests) {
          let maxEmendaNum = 0;
          for (const name of Object.keys(dests)) {
            const destArray = dests[name];
            if (!destArray) continue;
            
            let pageIndex = -1;
            if (typeof destArray[0] === 'number') {
              pageIndex = destArray[0];
            } else if (destArray[0] && typeof destArray[0] === 'object') {
              try {
                pageIndex = await pdfViewer.pdfDoc.getPageIndex(destArray[0]);
              } catch (err) {
                console.warn("Erro ao obter índice da página do destino:", name, err);
              }
            }
            
            if (pageIndex !== -1) {
              const page = await pdfViewer.pdfDoc.getPage(pageIndex + 1);
              const pageHeight = page.getViewport({ scale: 1 }).height;
              const pdfYFromBottom = destArray[3] || 0;
              const pymupdfY = pageHeight - pdfYFromBottom;
              
              // Adicionar ao estado
              state.addedDestinations[name] = {
                page: pageIndex,
                y: pymupdfY
              };
              
              // Adicionar marcador visual no viewer
              pdfViewer.addVisualMarker(name, pageIndex, pymupdfY);
              
              // Tentar extrair número de emenda regular para atualizar o contador
              const emendaMatch = name.match(/^Emenda(\d+)$/);
              if (emendaMatch) {
                const num = parseInt(emendaMatch[1]);
                if (num > maxEmendaNum) {
                  maxEmendaNum = num;
                }
              }
            }
          }
          
          if (maxEmendaNum > 0) {
            el.lastEmendaInput.value = maxEmendaNum;
          }
        }
      } catch (destErr) {
        console.warn("Aviso ao ler destinos existentes:", destErr);
      }
      
      updateDestinationsUI();
      el.fileNameDisplay.textContent = file.name;
      el.btnExport.removeAttribute('disabled');
    } catch (err) {
      console.error(err);
      alert('Erro ao processar o PDF. Certifique-se de que o arquivo é válido.');
      el.fileNameDisplay.textContent = 'Erro ao carregar PDF';
    }
  };
  reader.readAsArrayBuffer(file);
});

// Controles de Zoom
let currentZoom = 1.5;
el.btnZoomIn.addEventListener('click', async () => {
  if (currentZoom >= 3.0) return;
  currentZoom += 0.25;
  el.zoomVal.textContent = `${Math.round(currentZoom * 100)}%`;
  await pdfViewer.setZoom(currentZoom);
  redrawRedactions();
});

el.btnZoomOut.addEventListener('click', async () => {
  if (currentZoom <= 0.75) return;
  currentZoom -= 0.25;
  el.zoomVal.textContent = `${Math.round(currentZoom * 100)}%`;
  await pdfViewer.setZoom(currentZoom);
  redrawRedactions();
});

// Limpar todos os destinos
el.btnClearAll.addEventListener('click', () => {
  if (confirm('Deseja realmente limpar todos os destinos criados nesta sessão?')) {
    state.addedDestinations = {};
    state.replacements = [];
    pdfViewer.clearAllMarkers();
    redrawRedactions();
    updateDestinationsUI();
  }
});

// --- MENU DE CONTEXTO PERSONALIZADO ---

function showContextMenu(x, y, hasSelection) {
  // Atualizar número sugerido da próxima emenda
  const nextNum = parseInt(el.lastEmendaInput.value) + 1;
  el.nextEmendaNumSpans.forEach(span => span.textContent = nextNum);

  el.contextMenu.style.left = `${x}px`;
  el.contextMenu.style.top = `${y}px`;
  el.contextMenu.style.display = 'block';

  // Impedir que o menu saia da tela
  const menuRect = el.contextMenu.getBoundingClientRect();
  if (x + menuRect.width > window.innerWidth) {
    el.contextMenu.style.left = `${window.innerWidth - menuRect.width - 10}px`;
  }
  if (y + menuRect.height > window.innerHeight) {
    el.contextMenu.style.top = `${window.innerHeight - menuRect.height - 10}px`;
  }
}

function hideContextMenu() {
  el.contextMenu.style.display = 'none';
}

// Fechar menu de contexto ao clicar em qualquer lugar
document.addEventListener('click', () => hideContextMenu());
document.addEventListener('scroll', () => hideContextMenu(), true);

// Ação de Criar Emenda via Menu
el.menuAddEmenda.addEventListener('click', (event) => {
  event.stopPropagation();
  hideContextMenu();
  
  if (!state.activeRightClick) return;
  const { pageIndex, pdfY } = state.activeRightClick;
  
  const nextNum = parseInt(el.lastEmendaInput.value) + 1;
  const name = `Emenda${nextNum}`;
  
  addDestination(name, pageIndex, pdfY);
  
  // Incrementar contador da última emenda
  el.lastEmendaInput.value = nextNum;
});

// Ação de Criar Subemenda via Menu (Abre Modal Completo)
el.menuAddSubemenda.addEventListener('click', (event) => {
  event.stopPropagation();
  hideContextMenu();
  
  const hasSelection = state.activeSelection && state.activeSelection.selected;
  const commission = el.commissionInput.value.toUpperCase().trim() || 'CMA';
  const nextNum = parseInt(el.lastEmendaInput.value) + 1;
  
  el.subemendaEmendaNum.value = nextNum;
  el.subemendaSubNum.value = 1;
  
  if (hasSelection) {
    const selectedText = state.activeSelection.text;
    el.subemendaOriginalGroup.style.display = 'block';
    el.subemendaOriginalPreview.textContent = selectedText;
    el.subemendaReplaceGroup.style.display = 'block';
    
    // Tentar encontrar sigla original no texto selecionado usando traços diversos (Unicode/ASCII)
    let siglaOriginal = commission;
    const match = selectedText.match(/[\u2013\u2014-]\s*([a-zA-Z0-9_]+)/);
    if (match) {
      siglaOriginal = match[1].toUpperCase();
    }
    
    const updateSubemendaText = () => {
      const s = el.subemendaSubNum.value;
      const e = el.subemendaEmendaNum.value;
      el.subemendaNewTitleInput.value = `SUBEMENDA Nº ${s} - ${commission} À EMENDA Nº ${e} [${siglaOriginal}]`;
    };
    
    el.subemendaEmendaNum.oninput = updateSubemendaText;
    el.subemendaSubNum.oninput = updateSubemendaText;
    
    updateSubemendaText();
  } else {
    el.subemendaOriginalGroup.style.display = 'none';
    el.subemendaReplaceGroup.style.display = 'none';
    el.subemendaEmendaNum.oninput = null;
    el.subemendaSubNum.oninput = null;
  }
  
  el.subemendaModal.showModal();
});

// Ação de Substituição de Texto de Emenda via Menu
el.menuReplaceText.addEventListener('click', (event) => {
  event.stopPropagation();
  hideContextMenu();
  
  if (!state.activeSelection || !state.activeSelection.selected) return;
  
  const selectedText = state.activeSelection.text;
  el.originalTextPreview.textContent = selectedText;
  
  const commission = el.commissionInput.value.toUpperCase().trim() || 'CMA';
  const nextNum = parseInt(el.lastEmendaInput.value) + 1;
  
  // Tentar capturar sigla original no texto selecionado
  let sigla = commission;
  const match = selectedText.match(/[\u2013\u2014-]\s*([a-zA-Z0-9_]+)/);
  if (match) {
    sigla = match[1].toUpperCase();
  }
  
  el.newTitleInput.value = `EMENDA Nº ${nextNum} - ${sigla}`;
  
  // Abrir modal dialog nativo com light-dismiss
  el.replaceModal.showModal();
});

// --- DIALOG MODAL DE SUBSTITUIÇÃO ---

// Processar formulário de substituição de texto da Emenda
el.replaceForm.addEventListener('submit', (event) => {
  event.preventDefault();
  
  if (!state.activeSelection || !state.activeSelection.selected) return;
  
  const newTitle = el.newTitleInput.value.trim();
  if (!newTitle) return;

  const { pageIndex, rect, text: originalText } = state.activeSelection;

  // Calcular o nome do destino antes de registrar a substituição para vinculá-los
  let destName = null;
  if (el.chkCreateDest.checked) {
    const currentNextNum = parseInt(el.lastEmendaInput.value) + 1;
    const numMatch = newTitle.match(/(?:Nº|nº|NO|No|N|EMENDA)\s*(\d+)/i);
    const emendaNum = numMatch ? parseInt(numMatch[1]) : currentNextNum;
    destName = `Emenda${emendaNum}`;
  }

  // Registrar ação de substituição física no PDF, já vinculada ao destino
  state.replacements.push({
    pageIndex,
    rect,
    originalText,
    newText: newTitle,
    destName  // vínculo para limpeza ao excluir
  });

  // Criar o destino nomeado automaticamente para a emenda substituída
  if (destName) {
    const centerY = rect.y + (rect.height / 2);
    addDestination(destName, pageIndex, centerY);
    const numMatch = newTitle.match(/(?:Nº|nº|NO|No|N|EMENDA)\s*(\d+)/i);
    el.lastEmendaInput.value = numMatch ? parseInt(numMatch[1]) : parseInt(el.lastEmendaInput.value) + 1;
  }

  // Desenhar efeito de redação na tela do visualizador, vinculado ao destino
  applyVisualRedactionOverlay(pageIndex, rect, newTitle, destName);

  // Limpar seleção do navegador e do visualizador
  window.getSelection().removeAllRanges();
  state.activeSelection = { selected: false };
  if (pdfViewer) pdfViewer.clearSelection();
  
  el.replaceModal.close();
});

// --- CONTROLES DE AJUDA ---
el.btnHelp.addEventListener('click', () => {
  el.helpModal.showModal();
});
[el.closeHelp, el.btnHelpOk].forEach(btn => {
  if (btn) btn.addEventListener('click', () => el.helpModal.close());
});

// Fechar modais ao clicar fora (light-dismiss)
[el.replaceModal, el.subemendaModal, el.helpModal].forEach(modal => {
  if (!modal) return;
  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.close();
    }
  });
});

// Processar formulário do Modal de Subemenda
el.subemendaForm.addEventListener('submit', (event) => {
  event.preventDefault();
  
  const emendaNum = parseInt(el.subemendaEmendaNum.value);
  const subNum = parseInt(el.subemendaSubNum.value);
  
  if (isNaN(emendaNum) || isNaN(subNum)) return;
  
  const name = `Subemenda${subNum}Emenda${emendaNum}`;
  let pageIndex, yCoord;
  
  const hasSelection = state.activeSelection && state.activeSelection.selected;
  
  if (hasSelection) {
    const { rect, text: originalText } = state.activeSelection;
    pageIndex = state.activeSelection.pageIndex;
    yCoord = rect.y + (rect.height / 2);
    
    const newText = el.subemendaNewTitleInput.value.trim();
    
    state.replacements.push({
      pageIndex,
      rect,
      originalText,
      newText,
      destName: name  // vínculo para limpeza ao excluir
    });
    
    applyVisualRedactionOverlay(pageIndex, rect, newText, name);
  } else if (state.activeRightClick) {
    pageIndex = state.activeRightClick.pageIndex;
    yCoord = state.activeRightClick.pdfY;
  } else {
    return;
  }
  
  addDestination(name, pageIndex, yCoord);
  
  // Limpar seleção do navegador e do visualizador
  window.getSelection().removeAllRanges();
  state.activeSelection = { selected: false };
  if (pdfViewer) pdfViewer.clearSelection();
  
  el.subemendaModal.close();
});

// --- MANIPULAÇÃO DE DESTINOS ---

function addDestination(name, pageIndex, yCoord) {
  // Evitar destinos duplicados
  if (state.addedDestinations[name]) {
    alert(`Já existe um destino com o nome "${name}". Escolha outro nome.`);
    return;
  }
  
  state.addedDestinations[name] = {
    page: pageIndex,
    y: yCoord
  };
  
  // Adicionar indicador visual na tela
  pdfViewer.addVisualMarker(name, pageIndex, yCoord);
  
  updateDestinationsUI();
}

function removeDestination(name) {
  const data = state.addedDestinations[name];
  if (!data) return;

  // 1. Rolar até o ponto do destino no documento
  pdfViewer.scrollToPagePosition(data.page, data.y);

  // 2. Remover overlay(s) visual(is) vinculados a este destino
  const overlays = el.pdfViewer.querySelectorAll(`.redaction-preview-overlay[data-dest-name="${name}"]`);
  overlays.forEach(el => el.remove());

  // 3. Remover as entradas de substituição vinculadas do estado (libera o local para nova seleção)
  state.replacements = state.replacements.filter(rep => rep.destName !== name);

  // 4. Excluir o marcador visual e o destino do estado
  delete state.addedDestinations[name];
  pdfViewer.removeVisualMarker(name);
  updateDestinationsUI();

  // 5. Sincronizar novamente as redações visuais restantes
  redrawRedactions();
}

function updateDestinationsUI() {
  const keys = Object.keys(state.addedDestinations);
  el.destCount.textContent = keys.length;
  
  if (keys.length === 0) {
    el.destinationsList.innerHTML = `
      <div class="empty-state">
        <p>Nenhum destino criado ainda.</p>
        <p class="hint">Clique com o botão direito em uma página do PDF para marcar um destino ou substitua textos.</p>
      </div>
    `;
    return;
  }
  
  // Listar ordenado alfabeticamente para corresponder ao formato final do PDF
  const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b));
  
  el.destinationsList.innerHTML = '';
  sortedKeys.forEach(name => {
    const data = state.addedDestinations[name];
    
    const item = document.createElement('div');
    item.className = 'dest-item';
    item.role = 'listitem';
    
    item.innerHTML = `
      <div class="dest-item-info">
        <span class="dest-item-name" title="${name}">${name}</span>
        <span class="dest-item-page">Pág. ${data.page + 1} (Y: ${Math.round(data.y)}pt)</span>
      </div>
      <button class="btn-delete-dest" aria-label="Remover destino">&times;</button>
    `;
    
    // Clicar no item pula até a página/coordenada
    item.addEventListener('click', () => {
      pdfViewer.scrollToPagePosition(data.page, data.y);
    });
    
    // Clicar no botão excluir remove o destino
    const btnDel = item.querySelector('.btn-delete-dest');
    btnDel.addEventListener('click', (event) => {
      event.stopPropagation(); // Evitar pulo ao clicar em deletar
      removeDestination(name);
    });
    
    el.destinationsList.appendChild(item);
  });
}

// Aplica uma sobreposição visual cinza/branca na tela do visualizador para simular a redação
function applyVisualRedactionOverlay(pageIndex, rect, text, destName = null) {
  const pageContainer = el.pdfViewer.querySelector(`.pdf-page-container[data-page-index="${pageIndex}"]`);
  if (!pageContainer) return;
  
  const overlay = document.createElement('div');
  overlay.className = 'redaction-preview-overlay';
  overlay.style.position = 'absolute';
  if (destName) overlay.dataset.destName = destName;
  
  // Utilizar o zoom corrente para dimensionar em pixels
  overlay.style.left = `${rect.x * currentZoom}px`;
  overlay.style.top = `${rect.y * currentZoom}px`;
  overlay.style.width = `${rect.width * currentZoom}px`;
  overlay.style.height = `${rect.height * currentZoom}px`;
  overlay.style.backgroundColor = 'white';
  overlay.style.border = '1px dashed var(--color-primary)';
  overlay.style.boxShadow = 'var(--shadow-sm)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.color = '#000000';
  // Espelhar exatamente o PDF exportado: Times New Roman Bold, 14pt em zoom
  overlay.style.fontSize = `${14 * currentZoom}px`;
  overlay.style.fontFamily = '"Times New Roman", "Times", "Georgia", serif';
  overlay.style.fontWeight = 'bold';
  overlay.style.zIndex = '4';
  overlay.style.whiteSpace = 'nowrap';
  overlay.style.overflow = 'hidden';
  overlay.textContent = text.toUpperCase();
  overlay.title = 'Visualização da Redação (prévia fiel ao PDF gerado)';
  
  pageContainer.appendChild(overlay);
}

// Redesenha todas as redações visuais ativas ao alterar o zoom para preservá-las na tela
function redrawRedactions() {
  const overlays = el.pdfViewer.querySelectorAll('.redaction-preview-overlay');
  overlays.forEach(overlay => overlay.remove());

  state.replacements.forEach(rep => {
    applyVisualRedactionOverlay(rep.pageIndex, rep.rect, rep.newText, rep.destName);
  });
}

// --- EXPORTAÇÃO FINAL DE PDF ---

el.btnExport.addEventListener('click', async () => {
  if (!state.pdfBytes) return;
  
  let fileHandle = null;
  const baseName = state.fileName.substring(0, state.fileName.lastIndexOf('.')) || state.fileName;
  const suggestedName = `${baseName} - COM MARCAÇÕES.pdf`;

  // 1. Obter o handle de salvamento imediatamente para aproveitar o user gesture ativo, se disponível
  if (window.showSaveFilePicker) {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: suggestedName,
        types: [{
          description: 'Documento PDF',
          accept: { 'application/pdf': ['.pdf'] }
        }],
      });
    } catch (err) {
      // Se o usuário cancelou o diálogo de salvamento, abortamos silenciosamente
      if (err.name === 'AbortError') {
        return;
      }
      console.warn("showSaveFilePicker falhou ou foi bloqueado, usando fallback:", err);
      // Caso ocorra outro erro (como restrição de segurança), mantemos fileHandle como null para usar o fallback
    }
  }

  // 2. Alterar o estado do botão para indicar processamento
  const originalBtnText = el.btnExport.innerHTML;
  el.btnExport.innerHTML = `
    <svg class="icon animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
    Processando...
  `;
  el.btnExport.setAttribute('disabled', 'true');
  el.fileInput.setAttribute('disabled', 'true');

  try {
    // 3. Executar as modificações no PDF (operação de CPU assíncrona)
    const modifiedBytes = await executePdfModifications({
      pdfBytes: state.pdfBytes.slice(0),
      replacements: state.replacements,
      destinations: state.addedDestinations
    });
    
    const blob = new Blob([modifiedBytes], { type: 'application/pdf' });
    
    // 4. Gravar os dados reais no arquivo
    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    } else {
      // Fallback para navegadores sem showSaveFilePicker ou contextos inseguros
      const link = document.createElement('a');
      link.download = suggestedName;
      link.href = URL.createObjectURL(blob);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }
    
    alert('PDF processado e salvo com sucesso!');
  } catch (err) {
    console.error(err);
    alert('Erro ao exportar o PDF modificado. Veja o console para detalhes.');
  } finally {
    el.btnExport.innerHTML = originalBtnText;
    el.btnExport.removeAttribute('disabled');
    el.fileInput.removeAttribute('disabled');
  }
});

// Fallback manual para dialog light-dismiss em navegadores antigos (Safari)
if (el.replaceModal && !('closedBy' in HTMLDialogElement.prototype)) {
  el.replaceModal.addEventListener('click', (event) => {
    if (event.target !== el.replaceModal) return;
    
    const rect = el.replaceModal.getBoundingClientRect();
    const isInside = (
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width
    );
    
    if (!isInside) {
      el.replaceModal.close();
    }
  });
}

// --- REGISTRO DE SERVICE WORKER PARA PWA OFFLINE ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => {
        console.log('[PWA] Service Worker registrado com escopo:', reg.scope);
      })
      .catch((err) => {
        console.warn('[PWA] Falha ao registrar Service Worker:', err);
      });
  });
}

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
  // Auto-exibir Ajuda na primeira visita
  if (!localStorage.getItem('destinos_pdf_help_seen')) {
    if (el.helpModal) el.helpModal.showModal();
    localStorage.setItem('destinos_pdf_help_seen', 'true');
  }
});
