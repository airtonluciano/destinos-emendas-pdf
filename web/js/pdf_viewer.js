/**
 * Módulo de Renderização e Visualização do PDF usando PDF.js
 */

// Configurar o worker do PDF.js a partir da CDN para garantir funcionamento offline pelo Service Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

export class PdfViewer {
  constructor(containerEl, onSelectionChanged, onRightClickPage) {
    this.container = containerEl;
    this.onSelectionChanged = onSelectionChanged;
    this.onRightClickPage = onRightClickPage;
    this.pdfDoc = null;
    this.zoom = 1.5; // Zoom padrão (150%)
    this.pdfBytes = null;
    this.pageMarkers = {}; // Guarda marcadores visuais desenhados nas páginas: pageIndex -> Array of markerEls

    // Estado da seleção livre (marquee)
    this.isDragging = false;
    this.dragStartPage = null;
    this.dragStartY = 0;
    this.activeMarquee = null;

    // Registra os handlers globais de mouse
    window.addEventListener('mousemove', (e) => this.handleGlobalMouseMove(e));
    window.addEventListener('mouseup', (e) => this.handleGlobalMouseUp(e));
  }

  async loadPDF(pdfBytes) {
    this.pdfBytes = pdfBytes;
    
    // Carregar o PDF usando o PDF.js
    const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
    this.pdfDoc = await loadingTask.promise;
    this.pageMarkers = {};
    
    await this.render();
  }

  setZoom(newZoom) {
    this.zoom = newZoom;
    if (this.pdfDoc) {
      this.render();
    }
  }

  async render() {
    if (!this.pdfDoc) return;

    // Limpar o visualizador
    this.container.innerHTML = '';

    const numPages = this.pdfDoc.numPages;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageIndex = pageNum - 1;
      const page = await this.pdfDoc.getPage(pageNum);
      
      // 1. Criar wrapper da página
      const pageContainer = document.createElement('div');
      pageContainer.className = 'pdf-page-container';
      pageContainer.dataset.pageIndex = pageIndex;
      pageContainer.style.margin = '0 auto 24px auto';
      
      // Obter dimensões e aplicar zoom
      const viewport = page.getViewport({ scale: this.zoom });
      pageContainer.style.width = `${viewport.width}px`;
      pageContainer.style.height = `${viewport.height}px`;
      
      // 2. Criar e renderizar Canvas
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      pageContainer.appendChild(canvas);
      
      // Renderizar conteúdo gráfico do PDF no canvas
      await page.render({
        canvasContext: ctx,
        viewport: viewport
      }).promise;
      
      // 3. Criar camada de texto (TextLayer) para seleção de texto nativa
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;
      pageContainer.appendChild(textLayerDiv);
      
      const textContent = await page.getTextContent();
      await pdfjsLib.renderTextLayer({
        textContent: textContent,
        container: textLayerDiv,
        viewport: viewport,
        textDivs: []
      }).promise;

      // 3.5 Criar Camada Interativa para captura limpa de cliques e drag sem interferência de seleção de texto
      const interactiveOverlay = document.createElement('div');
      interactiveOverlay.className = 'interactive-overlay';
      pageContainer.appendChild(interactiveOverlay);

      // 4. Configurar eventos de seleção e clique com botão direito
      this.setupPageEvents(pageContainer, pageIndex);
      
      // Re-desenhar marcadores visuais se existirem para esta página
      this.redrawMarkers(pageContainer, pageIndex);

      this.container.appendChild(pageContainer);
    }
  }

  setupPageEvents(pageContainer, pageIndex) {
    const interactiveOverlay = pageContainer.querySelector('.interactive-overlay') || pageContainer;
    
    // Iniciar seleção Marquee ao pressionar o botão esquerdo do mouse
    interactiveOverlay.addEventListener('mousedown', (event) => {
      // Ignorar se não for clique com botão esquerdo
      if (event.button !== 0) return;
      
      event.preventDefault();
      
      const rect = pageContainer.getBoundingClientRect();
      const startY = event.clientY - rect.top;
      
      // Criar ou obter o elemento marquee para esta página
      let marquee = pageContainer.querySelector('.page-marquee-selection');
      if (!marquee) {
        marquee = document.createElement('div');
        marquee.className = 'page-marquee-selection';
        marquee.style.position = 'absolute';
        marquee.style.left = '0';
        marquee.style.width = '100%';
        pageContainer.appendChild(marquee);
      }
      
      // Configurar estado do drag
      this.isDragging = true;
      this.dragStartPage = pageIndex;
      this.dragStartY = startY;
      this.dragStartX = event.clientX;
      this.dragStartMouseY = event.clientY;
      this.activeMarquee = marquee;
    });

    // Detectar clique com o botão direito para o menu de contexto
    interactiveOverlay.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      
      const pageRect = pageContainer.getBoundingClientRect();
      const clickY = event.clientY - pageRect.top;
      
      // O clique com o botão direito usará a seleção ativa se houver
      const marquee = pageContainer.querySelector('.page-marquee-selection');
      let hasSelection = marquee && marquee.style.display === 'block' && parseFloat(marquee.style.height) > 5;
      
      if (hasSelection) {
        const top = parseFloat(marquee.style.top);
        const height = parseFloat(marquee.style.height);
        // Se clicar muito fora da seleção ativa, ignora-a e tenta re-detectar
        if (clickY < top - 10 || clickY > top + height + 10) {
          hasSelection = false;
        }
      }
      
      if (!hasSelection) {
        // Auto-detecção de linha no clique do botão direito!
        const line = this.detectLineAtY(pageContainer, clickY);
        if (line) {
          this.clearSelection();
          
          let pageMarquee = pageContainer.querySelector('.page-marquee-selection');
          if (!pageMarquee) {
            pageMarquee = document.createElement('div');
            pageMarquee.className = 'page-marquee-selection';
            pageMarquee.style.position = 'absolute';
            pageMarquee.style.left = '0';
            pageMarquee.style.width = '100%';
            pageContainer.appendChild(pageMarquee);
          }
          
          pageMarquee.style.top = `${line.top}px`;
          pageMarquee.style.height = `${line.height}px`;
          pageMarquee.style.display = 'block';
          
          const pdfY = line.top / this.zoom;
          const pdfHeight = line.height / this.zoom;
          
          this.onSelectionChanged({
            selected: true,
            text: line.text,
            pageIndex: pageIndex,
            rect: {
              x: 0,
              y: pdfY,
              width: pageRect.width / this.zoom,
              height: pdfHeight
            }
          });
          
          hasSelection = true;
        }
      }
      
      this.onRightClickPage({
        x: event.pageX,
        y: event.pageY,
        pdfY: clickY / this.zoom,
        pageIndex: pageIndex,
        hasSelection: hasSelection
      });
    });
  }

  handleGlobalMouseMove(event) {
    if (!this.isDragging || !this.activeMarquee || this.dragStartPage === null) return;
    
    // Evitar jitter de início de arrasto no clique inicial
    const deltaX = Math.abs(event.clientX - this.dragStartX);
    const deltaY = Math.abs(event.clientY - this.dragStartMouseY);
    if (deltaX < 4 && deltaY < 4) return;
    
    const pageContainer = this.container.querySelector(`.pdf-page-container[data-page-index="${this.dragStartPage}"]`);
    if (!pageContainer) return;
    
    const rect = pageContainer.getBoundingClientRect();
    
    // Calcular e limitar Y aos limites da página
    let currentY = event.clientY - rect.top;
    currentY = Math.max(0, Math.min(rect.height, currentY));
    
    const top = Math.min(this.dragStartY, currentY);
    const height = Math.abs(this.dragStartY - currentY);
    
    this.activeMarquee.style.top = `${top}px`;
    this.activeMarquee.style.height = `${height}px`;
    this.activeMarquee.style.display = 'block';
  }
  
  handleGlobalMouseUp(event) {
    if (!this.isDragging || this.dragStartPage === null) return;
    this.isDragging = false;
    
    const pageIndex = this.dragStartPage;
    const pageContainer = this.container.querySelector(`.pdf-page-container[data-page-index="${pageIndex}"]`);
    if (!pageContainer || !this.activeMarquee) return;
    
    const rect = pageContainer.getBoundingClientRect();
    
    // Detectar se foi um clique curto ou arraste real
    const deltaX = Math.abs(event.clientX - this.dragStartX);
    const deltaY = Math.abs(event.clientY - this.dragStartMouseY);
    const clickY = this.dragStartY;
    
    if (deltaX <= 4 && deltaY <= 4) {
      // Clique rápido: auto-detectar linha sob o clique
      const line = this.detectLineAtY(pageContainer, clickY);
      if (line) {
        this.clearSelection();
        
        this.activeMarquee.style.top = `${line.top}px`;
        this.activeMarquee.style.height = `${line.height}px`;
        this.activeMarquee.style.display = 'block';
        
        const pdfY = line.top / this.zoom;
        const pdfHeight = line.height / this.zoom;
        
        this.onSelectionChanged({
          selected: true,
          text: line.text,
          pageIndex: pageIndex,
          rect: {
            x: 0,
            y: pdfY,
            width: rect.width / this.zoom,
            height: pdfHeight
          }
        });
        
        // Abrir menu de contexto na posição do mouse automaticamente
        this.onRightClickPage({
          x: event.pageX,
          y: event.pageY,
          pdfY: (line.top + (line.height / 2)) / this.zoom,
          pageIndex: pageIndex,
          hasSelection: true
        });
      } else {
        this.clearSelection();
      }
    } else {
      // Arraste manual de seleção
      let currentY = event.clientY - rect.top;
      currentY = Math.max(0, Math.min(rect.height, currentY));
      
      const top = Math.min(this.dragStartY, currentY);
      const height = Math.abs(this.dragStartY - currentY);
      
      if (height > 5) {
        const padding = 3;
        const paddedTop = Math.max(0, top - padding);
        const paddedHeight = height + (padding * 2);
        
        const pdfX = 0;
        const pdfY = paddedTop / this.zoom;
        const pdfWidth = rect.width / this.zoom;
        const pdfHeight = paddedHeight / this.zoom;
        
        const text = this.getTextInVerticalRange(pageContainer, top, top + height);
        
        this.onSelectionChanged({
          selected: true,
          text: text,
          pageIndex: pageIndex,
          rect: {
            x: pdfX,
            y: pdfY,
            width: pdfWidth,
            height: pdfHeight
          }
        });
        
        this.onRightClickPage({
          x: event.pageX,
          y: event.pageY,
          pdfY: (top + (height / 2)) / this.zoom,
          pageIndex: pageIndex,
          hasSelection: true
        });
      } else {
        this.clearSelection();
      }
    }
  }
  
  getTextInVerticalRange(pageContainer, startY, endY) {
    const textSpans = pageContainer.querySelectorAll('.textLayer > span, .textLayer > div');
    const matchingTexts = [];
    
    textSpans.forEach(span => {
      const rect = span.getBoundingClientRect();
      const containerRect = pageContainer.getBoundingClientRect();
      
      const top = rect.top - containerRect.top;
      const bottom = rect.bottom - containerRect.top;
      
      if (bottom >= startY - 2 && top <= endY + 2) {
        matchingTexts.push({
          text: span.textContent,
          top: top
        });
      }
    });
    
    matchingTexts.sort((a, b) => a.top - b.top);
    return matchingTexts.map(t => t.text).join(' ').replace(/\s+/g, ' ').trim();
  }

  detectLineAtY(pageContainer, clickY) {
    const textSpans = pageContainer.querySelectorAll('.textLayer > span, .textLayer > div');
    let bestSpan = null;
    let minDistance = 15; // 15px de tolerância vertical
    
    textSpans.forEach(span => {
      const rect = span.getBoundingClientRect();
      const containerRect = pageContainer.getBoundingClientRect();
      
      const top = rect.top - containerRect.top;
      const bottom = rect.bottom - containerRect.top;
      
      let dist = 0;
      if (clickY < top) {
        dist = top - clickY;
      } else if (clickY > bottom) {
        dist = clickY - bottom;
      } else {
        dist = 0; // está dentro da faixa vertical
      }
      
      if (dist < minDistance) {
        minDistance = dist;
        bestSpan = span;
      }
    });
    
    if (bestSpan) {
      const bestRect = bestSpan.getBoundingClientRect();
      const containerRect = pageContainer.getBoundingClientRect();
      const bestTop = bestRect.top - containerRect.top;
      const bestBottom = bestRect.bottom - containerRect.top;
      const bestHeight = bestRect.height;
      const midY = bestTop + bestHeight / 2;
      
      const lineSpans = [];
      textSpans.forEach(span => {
        const rect = span.getBoundingClientRect();
        const top = rect.top - containerRect.top;
        const bottom = rect.bottom - containerRect.top;
        const height = rect.height;
        const spanMidY = top + height / 2;
        
        // Se a diferença entre os centros verticais for menor que 8px, é a mesma linha
        if (Math.abs(spanMidY - midY) < 8) {
          lineSpans.push({
            span: span,
            top: top,
            bottom: bottom,
            left: rect.left - containerRect.left
          });
        }
      });
      
      if (lineSpans.length > 0) {
        // Ordenar horizontalmente da esquerda para a direita
        lineSpans.sort((a, b) => a.left - b.left);
        
        const minTop = Math.min(...lineSpans.map(ls => ls.top));
        const maxBottom = Math.max(...lineSpans.map(ls => ls.bottom));
        
        const lineText = lineSpans.map(ls => ls.span.textContent).join(' ').replace(/\s+/g, ' ').trim();
        
        return {
          top: minTop,
          bottom: maxBottom,
          height: maxBottom - minTop,
          text: lineText
        };
      }
    }
    
    return null;
  }
  
  clearSelection() {
    const marquees = this.container.querySelectorAll('.page-marquee-selection');
    marquees.forEach(m => {
      m.style.height = '0px';
      m.style.display = 'none';
    });
    this.onSelectionChanged({ selected: false });
  }

  // Adiciona um marcador visual na página correspondente ao destino nomeado
  addVisualMarker(name, pageIndex, yCoord) {
    if (!this.pageMarkers[pageIndex]) {
      this.pageMarkers[pageIndex] = [];
    }
    
    // Remover duplicados com o mesmo nome para evitar poluír a página
    this.pageMarkers[pageIndex] = this.pageMarkers[pageIndex].filter(m => m.name !== name);
    
    this.pageMarkers[pageIndex].push({ name, y: yCoord });
    
    // Atualizar visualizadores ativos na tela
    const pageContainer = this.container.querySelector(`.pdf-page-container[data-page-index="${pageIndex}"]`);
    if (pageContainer) {
      this.redrawMarkers(pageContainer, pageIndex);
    }
  }

  removeVisualMarker(name) {
    for (const idx of Object.keys(this.pageMarkers)) {
      this.pageMarkers[idx] = this.pageMarkers[idx].filter(m => m.name !== name);
      const pageContainer = this.container.querySelector(`.pdf-page-container[data-page-index="${idx}"]`);
      if (pageContainer) {
        this.redrawMarkers(pageContainer, parseInt(idx));
      }
    }
  }

  clearAllMarkers() {
    this.pageMarkers = {};
    const containers = this.container.querySelectorAll('.pdf-page-container');
    containers.forEach((container, idx) => {
      this.redrawMarkers(container, idx);
    });
  }

  redrawMarkers(pageContainer, pageIndex) {
    // Limpar marcadores anteriores na tela
    const existing = pageContainer.querySelectorAll('.visual-marker');
    existing.forEach(el => el.remove());

    const markers = this.pageMarkers[pageIndex] || [];
    markers.forEach(marker => {
      const markerEl = document.createElement('div');
      markerEl.className = 'visual-marker';
      
      // Posicionar verticalmente baseando-se no zoom ativo
      const screenY = marker.y * this.zoom;
      markerEl.style.top = `${screenY}px`;
      markerEl.setAttribute('data-label', marker.name);
      
      pageContainer.appendChild(markerEl);
    });
  }

  scrollToPagePosition(pageIndex, yCoord) {
    const pageContainer = this.container.querySelector(`.pdf-page-container[data-page-index="${pageIndex}"]`);
    if (pageContainer) {
      // Calcular a posição de rolagem em pixels
      const screenY = yCoord * this.zoom;
      const elementTop = pageContainer.offsetTop + screenY;
      
      // Rolar o container principal
      this.container.parentElement.scrollTo({
        top: elementTop - 60, // Margem confortável para o header do workspace
        behavior: 'smooth'
      });
      
      // Efeito visual temporário para destacar a página correspondente
      pageContainer.style.transition = 'box-shadow 0.5s ease';
      pageContainer.style.boxShadow = '0 0 30px hsla(238, 83%, 66%, 0.6)';
      setTimeout(() => {
        pageContainer.style.boxShadow = '';
      }, 1500);
    }
  }
}
