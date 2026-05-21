import fitz
import os
import io
from pypdf import PdfReader, PdfWriter
from pypdf.generic import Fit

class PdfManager:
    def __init__(self):
        self.doc = None
        self.filepath = None
        # Dicionário de destinos criados nesta sessão: name -> {"page": page_index, "y": float, "zoom": float}
        self.added_destinations = {}
    
    def load_pdf(self, filepath):
        self.filepath = filepath
        self.doc = fitz.open(filepath)
        self.added_destinations.clear()
        
        # Carregar destinos existentes
        try:
            reader = PdfReader(filepath)
            dests = reader.named_destinations
            for k, v in dests.items():
                page_obj = v.get('/Page')
                if not page_obj:
                    continue
                
                # Achar o indice da pagina
                page_idx = -1
                for i, p in enumerate(reader.pages):
                    if p.indirect_reference == page_obj.indirect_reference:
                        page_idx = i
                        break
                
                if page_idx != -1:
                    top = float(v.get('/Top', 0))
                    page = reader.pages[page_idx]
                    page_height = float(page.mediabox.top)
                    pymupdf_y = page_height - top
                    self.added_destinations[k] = {"page": page_idx, "y": pymupdf_y}
        except Exception as e:
            print(f"Aviso ao ler destinos existentes: {e}")
        
    def get_page_count(self):
        return len(self.doc) if self.doc else 0
        
    def get_page_pixmap(self, page_num, zoom=2.0):
        if not self.doc or page_num < 0 or page_num >= len(self.doc):
            return None
        page = self.doc[page_num]
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        return pix
        
    def add_destination(self, name, page_num, point_y):
        self.added_destinations[name] = {"page": page_num, "y": point_y}
        
    def remove_destination(self, name):
        if name in self.added_destinations:
            del self.added_destinations[name]
            
    def get_destinations(self):
        return self.added_destinations
        
    def get_text_in_rect(self, page_num, rect_points):
        # rect_points: tuple (x0, y0, x1, y1) in points
        if not self.doc or page_num < 0 or page_num >= len(self.doc):
            return ""
        page = self.doc[page_num]
        rect = fitz.Rect(*rect_points)
        return page.get_textbox(rect).strip()

    def replace_text(self, page_num, rect_points, new_text):
        if not self.doc or page_num < 0 or page_num >= len(self.doc):
            return False
        page = self.doc[page_num]
        rect = fitz.Rect(*rect_points)
        
        # Corrigir problema de encoding com o travessão/traço (em-dash/en-dash)
        new_text = new_text.replace("–", "-").replace("—", "-")
        
        # Em vez de redigir apenas a área exata (que pode falhar se a seleção for muito fina),
        # buscamos todas as palavras que tocam na área selecionada e redigimos suas caixas exatas.
        words = page.get_text("words")
        for w in words:
            w_rect = fitz.Rect(w[:4])
            if w_rect.intersects(rect):
                page.add_redact_annot(w_rect, fill=(1, 1, 1))
                
        # Fallback de segurança no rect original
        page.add_redact_annot(rect, fill=(1, 1, 1))
        page.apply_redactions()
        
        # Usamos insert_text para ignorar os limites do bounding box e não cortar textos grandes
        text_length = fitz.get_text_length(new_text, fontname="tibo", fontsize=13)
        
        # Centralizar na largura INTEIRA da página, garantindo alinhamento perfeito
        page_rect = page.rect
        center_x = page_rect.width / 2
        start_x = center_x - (text_length / 2)
        y_baseline = rect.y0 + (rect.y1 - rect.y0) * 0.75
        
        page.insert_text((start_x, y_baseline), new_text, fontname="tibo", fontsize=13)
        return True

    def save_pdf(self, output_path):
        if not self.filepath or not self.doc:
            return False
        
        try:
            # Salvar os bytes modificados pelo PyMuPDF (edições de texto) em memória
            pdf_bytes = self.doc.write()
            pdf_stream = io.BytesIO(pdf_bytes)
            
            # Abrir o stream de bytes com pypdf
            reader = PdfReader(pdf_stream)
            writer = PdfWriter()
            writer.append(reader)
            
            # Remove destinos antigos para não duplicar
            if "/Names" in writer.root_object and "/Dests" in writer.root_object["/Names"]:
                del writer.root_object["/Names"]["/Dests"]
            
            from pypdf.generic import ArrayObject, FloatObject, NameObject, TextStringObject
            
            for name, data in self.added_destinations.items():
                page_index = data["page"]
                y_coord = data["y"]
                
                page = writer.pages[page_index]
                page_height = float(page.mediabox.top)
                pdf_y = page_height - y_coord
                
                dest_array = ArrayObject([
                    page.indirect_reference,
                    NameObject("/XYZ"),
                    FloatObject(0.0),
                    FloatObject(pdf_y),
                    FloatObject(0.0)
                ])
                
                writer.add_named_destination_array(TextStringObject(name), dest_array)
                
            with open(output_path, "wb") as f:
                writer.write(f)
                
            return True
        except Exception as e:
            print(f"Erro ao salvar PDF: {e}")
            return False
