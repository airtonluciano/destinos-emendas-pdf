from PyQt6.QtWidgets import QGraphicsView, QGraphicsScene, QGraphicsPixmapItem, QRubberBand
from PyQt6.QtGui import QPixmap, QImage
from PyQt6.QtCore import Qt, pyqtSignal, QRect, QPoint, QRectF

class PdfViewer(QGraphicsView):
    right_clicked = pyqtSignal(int, float, tuple) # page_num, y_coord_in_points, rect_points (x0, y0, x1, y1) or empty tuple

    def __init__(self, parent=None):
        super().__init__(parent)
        self.scene = QGraphicsScene(self)
        self.setScene(self.scene)
        self.pdf_manager = None
        self.page_items = []
        self.zoom = 1.5
        self.rubberBand = QRubberBand(QRubberBand.Shape.Rectangle, self)
        self.origin = QPoint()

    def load_pdf(self, pdf_manager):
        self.scene.clear()
        self.page_items.clear()
        self.pdf_manager = pdf_manager
        
        current_y = 0
        spacing = 10
        
        for i in range(pdf_manager.get_page_count()):
            pix = pdf_manager.get_page_pixmap(i, zoom=self.zoom)
            if pix:
                fmt = QImage.Format.Format_RGBA8888 if pix.alpha else QImage.Format.Format_RGB888
                img = QImage(pix.samples, pix.width, pix.height, pix.stride, fmt)
                qpixmap = QPixmap.fromImage(img)
                
                item = QGraphicsPixmapItem(qpixmap)
                item.setPos(0, current_y)
                self.scene.addItem(item)
                
                self.page_items.append({
                    "item": item,
                    "page_num": i,
                    "y_start": current_y,
                    "y_end": current_y + pix.height
                })
                
                current_y += pix.height + spacing

    def scroll_to(self, page_num, pdf_y):
        for p_info in self.page_items:
            if p_info["page_num"] == page_num:
                local_y = pdf_y * self.zoom
                target_y = p_info["y_start"] + local_y
                
                scrollbar = self.verticalScrollBar()
                if scrollbar:
                    # Center the point vertically with a little margin
                    scrollbar.setValue(int(target_y - 100))
                break

    def refresh_page(self, page_num):
        for p_info in self.page_items:
            if p_info["page_num"] == page_num:
                pix = self.pdf_manager.get_page_pixmap(page_num, zoom=self.zoom)
                if pix:
                    fmt = QImage.Format.Format_RGBA8888 if pix.alpha else QImage.Format.Format_RGB888
                    img = QImage(pix.samples, pix.width, pix.height, pix.stride, fmt)
                    qpixmap = QPixmap.fromImage(img)
                    p_info["item"].setPixmap(qpixmap)
                break

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.origin = event.pos()
            self.rubberBand.setGeometry(QRect(self.origin, self.origin))
            self.rubberBand.show()
            
        elif event.button() == Qt.MouseButton.RightButton and self.pdf_manager:
            scene_pos = self.mapToScene(event.pos())
            y = scene_pos.y()
            
            is_inside_selection = False
            scene_rect = None
            if self.rubberBand.isVisible():
                if self.rubberBand.geometry().contains(event.pos()):
                    is_inside_selection = True
                    view_rect = self.rubberBand.geometry()
                    tl = self.mapToScene(view_rect.topLeft())
                    br = self.mapToScene(view_rect.bottomRight())
                    scene_rect = QRectF(tl, br)
            
            for p_info in self.page_items:
                if p_info["y_start"] <= y <= p_info["y_end"]:
                    local_y = y - p_info["y_start"]
                    pdf_y = local_y / self.zoom
                    
                    rect_points = tuple()
                    if is_inside_selection and scene_rect:
                        p_tl_x = scene_rect.left() / self.zoom
                        p_tl_y = (scene_rect.top() - p_info["y_start"]) / self.zoom
                        p_br_x = scene_rect.right() / self.zoom
                        p_br_y = (scene_rect.bottom() - p_info["y_start"]) / self.zoom
                        rect_points = (p_tl_x, p_tl_y, p_br_x, p_br_y)
                    
                    self.right_clicked.emit(p_info["page_num"], pdf_y, rect_points)
                    break
            
            self.rubberBand.hide()
        
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        super().mouseMoveEvent(event)
        if hasattr(self, 'origin'):
            if self.rubberBand.isVisible():
                rect = QRect(self.origin, event.pos()).normalized()
                
                # Expandir para a largura inteira da página do PDF
                if self.scene and self.page_items:
                    try:
                        # Usa o item da primeira página como referência de largura
                        item = self.page_items[0]["item"]
                        poly = self.mapFromScene(item.sceneBoundingRect())
                        item_rect = poly.boundingRect()
                        rect.setLeft(item_rect.left())
                        rect.setRight(item_rect.right())
                    except Exception as e:
                        pass # Fallback caso a cena não esteja pronta
                
                self.rubberBand.setGeometry(rect)
