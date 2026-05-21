import os
import sys
from PyQt6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QPushButton, 
    QLabel, QLineEdit, QSplitter, QListWidget, QFileDialog, 
    QMenu, QDialog, QFormLayout, QSpinBox, QMessageBox
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QIcon
from gui.pdf_viewer import PdfViewer
from core.pdf_manager import PdfManager

class SubemendaDialog(QDialog):
    def __init__(self, original_text=None, default_n=1, default_sigla="", parent=None):
        super().__init__(parent)
        self.setWindowTitle("Nova Subemenda")
        
        self.emenda_spin = QSpinBox()
        self.emenda_spin.setRange(1, 99999)
        self.emenda_spin.setValue(default_n)
        
        self.subemenda_spin = QSpinBox()
        self.subemenda_spin.setRange(1, 99999)
        
        self.replace_text = None
        
        layout = QFormLayout(self)
        layout.addRow("Número da Emenda:", self.emenda_spin)
        layout.addRow("Número da Subemenda:", self.subemenda_spin)
        
        if original_text:
            import re
            sigla = default_sigla
            match = re.search(r"–\s*(\w+)", original_text)
            if match and not sigla: # Usa regex apenas se não houver sigla padrão ou pode sobrescrever? O melhor é usar a default_sigla se preenchida.
                sigla = match.group(1).upper()
            
            self.replace_edit = QLineEdit(f"SUBEMENDA Nº  - {sigla} À EMENDA Nº  [SIGLA]")
            self.replace_edit.setMinimumWidth(300)
            layout.addRow("Texto original:", QLabel(original_text))
            layout.addRow("Substituir por:", self.replace_edit)
            
            # Atualiza o texto quando os spins mudam
            def update_text():
                s = self.subemenda_spin.value()
                e = self.emenda_spin.value()
                self.replace_edit.setText(f"SUBEMENDA Nº {s} - {sigla} À EMENDA Nº {e} [SIGLA]")
                
            self.emenda_spin.valueChanged.connect(update_text)
            self.subemenda_spin.valueChanged.connect(update_text)
            update_text()
            
        btn_ok = QPushButton("Criar")
        btn_ok.clicked.connect(self.accept)
        layout.addRow(btn_ok)

class ReplaceEmendaDialog(QDialog):
    def __init__(self, original_text, n, default_sigla="", parent=None):
        super().__init__(parent)
        self.setWindowTitle("Substituir Texto da Emenda")
        layout = QFormLayout(self)
        
        import re
        sigla = default_sigla
        match = re.search(r"–\s*(\w+)", original_text)
        if match and not sigla:
            sigla = match.group(1).upper()
            
        self.replace_edit = QLineEdit(f"EMENDA Nº {n} – {sigla}")
        self.replace_edit.setMinimumWidth(300)
        
        layout.addRow("Texto original:", QLabel(original_text))
        layout.addRow("Substituir por:", self.replace_edit)
        
        btn_ok = QPushButton("Substituir e Criar Destino")
        btn_ok.clicked.connect(self.accept)
        layout.addRow(btn_ok)

def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Criador de Destinos em PDF - Emendas de Relator")
        self.setWindowIcon(QIcon(resource_path("hand-point.png")))
        self.resize(1000, 700)
        
        self.pdf_manager = PdfManager()
        
        self.init_ui()
        
    def init_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        main_layout = QVBoxLayout(central_widget)
        
        # Top Bar
        
        # Menu
        menubar = self.menuBar()
        help_menu = menubar.addMenu("Ajuda")
        action_instructions = help_menu.addAction("Instruções de Uso")
        action_instructions.triggered.connect(self.show_instructions)
        
        # Controls layout
        controls_layout = QHBoxLayout()
        self.btn_open = QPushButton("Abrir PDF")
        self.btn_open.clicked.connect(self.open_pdf)
        
        self.input_r = QLineEdit()
        self.input_r.setFixedWidth(50)
        self.input_r.setText("0")
        
        self.input_sigla = QLineEdit()
        self.input_sigla.setFixedWidth(80)
        self.input_sigla.setPlaceholderText("Ex: CMA")
        
        controls_layout.addWidget(self.btn_open)
        controls_layout.addWidget(QLabel("Nº da última emenda de membro:"))
        controls_layout.addWidget(self.input_r)
        controls_layout.addWidget(QLabel("Sigla para emendas de relator:"))
        controls_layout.addWidget(self.input_sigla)
        controls_layout.addStretch()
        
        self.btn_save = QPushButton("Salvar PDF/A (Final)")
        self.btn_save.clicked.connect(self.save_pdf)
        controls_layout.addWidget(self.btn_save)
        
        main_layout.addLayout(controls_layout)
        
        # Splitter for list and viewer
        splitter = QSplitter(Qt.Orientation.Horizontal)
        
        # Left Panel (Destinations)
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(0, 0, 0, 0)
        
        left_layout.addWidget(QLabel("Destinos Criados:"))
        self.list_destinations = QListWidget()
        self.list_destinations.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.list_destinations.customContextMenuRequested.connect(self.show_list_menu)
        self.list_destinations.itemClicked.connect(self.on_destination_clicked)
        left_layout.addWidget(self.list_destinations)
        
        splitter.addWidget(left_panel)
        
        # Right Panel (PDF Viewer)
        self.viewer = PdfViewer()
        self.viewer.right_clicked.connect(self.on_pdf_right_clicked)
        splitter.addWidget(self.viewer)
        
        splitter.setSizes([200, 800])
        main_layout.addWidget(splitter)
        
    def open_pdf(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Abrir PDF", "", "PDF Files (*.pdf)"
        )
        if file_path:
            self.current_file_path = file_path
            self.pdf_manager.load_pdf(file_path)
            self.viewer.load_pdf(self.pdf_manager)
            self.update_list()
            self.setWindowTitle(f"Criador de Destinos em PDF - {os.path.basename(file_path)}")
            
    def save_pdf(self):
        if not self.pdf_manager.doc:
            QMessageBox.warning(self, "Aviso", "Nenhum documento aberto.")
            return
            
        suggested_name = "documento_com_destinos.pdf"
        if hasattr(self, 'current_file_path') and self.current_file_path:
            base, ext = os.path.splitext(self.current_file_path)
            suggested_name = f"{base} - COM MARCAÇÕES{ext}"
            
        file_path, _ = QFileDialog.getSaveFileName(
            self, "Salvar PDF", suggested_name, "PDF Files (*.pdf)"
        )
        if file_path:
            success = self.pdf_manager.save_pdf(file_path)
            if success:
                QMessageBox.information(self, "Sucesso", "PDF salvo com sucesso!")
            else:
                QMessageBox.critical(self, "Erro", "Ocorreu um erro ao salvar o PDF.")
                
    def on_pdf_right_clicked(self, page_num, y_coord, rect_points=tuple()):
        try:
            try:
                r = int(self.input_r.text())
            except ValueError:
                r = 0
                self.input_r.setText("0")
                
            n = r + 1
            
            menu = QMenu(self)
            
            has_selection = len(rect_points) == 4
            original_text = ""
            if has_selection:
                original_text = self.pdf_manager.get_text_in_rect(page_num, rect_points)
                if not original_text.strip():
                    has_selection = False
                    
            if has_selection:
                action_emenda = menu.addAction(f"Substituir texto e criar Emenda{n}")
                action_subemenda = menu.addAction("Substituir texto e criar Subemenda...")
            else:
                action_emenda = menu.addAction(f"Criar destino Emenda{n}")
                action_subemenda = menu.addAction("Criar destino de Subemenda...")
            
            from PyQt6.QtGui import QCursor
            action = menu.exec(QCursor.pos())
            
            if not action:
                return
                
            sigla_relator = self.input_sigla.text().strip().upper()
            
            if action == action_emenda:
                if has_selection:
                    dlg = ReplaceEmendaDialog(original_text, n, sigla_relator, self)
                    if dlg.exec() == QDialog.DialogCode.Accepted:
                        new_text = dlg.replace_edit.text()
                        self.pdf_manager.replace_text(page_num, rect_points, new_text)
                        self.viewer.refresh_page(page_num)
                    else:
                        return # Cancelado
                        
                name = f"Emenda{n}"
                self.pdf_manager.add_destination(name, page_num, y_coord)
                self.input_r.setText(str(n))
                self.update_list()
                
            elif action == action_subemenda:
                dlg = SubemendaDialog(original_text if has_selection else None, default_n=n, default_sigla=sigla_relator, parent=self)
                if dlg.exec() == QDialog.DialogCode.Accepted:
                    emenda_num = dlg.emenda_spin.value()
                    sub_num = dlg.subemenda_spin.value()
                    
                    if has_selection:
                        new_text = dlg.replace_edit.text()
                        self.pdf_manager.replace_text(page_num, rect_points, new_text)
                        self.viewer.refresh_page(page_num)
                        
                    name = f"Subemenda{sub_num}Emenda{emenda_num}"
                    self.pdf_manager.add_destination(name, page_num, y_coord)
                    self.update_list()
        except Exception as e:
            import traceback
            error_msg = f"Erro ao processar clique:\n{str(e)}\n\n{traceback.format_exc()}"
            QMessageBox.critical(self, "Erro Fatal", error_msg)

    def update_list(self):
        self.list_destinations.clear()
        dests = self.pdf_manager.get_destinations()
        for name in dests:
            self.list_destinations.addItem(name)
            
    def on_destination_clicked(self, item):
        name = item.text()
        dest = self.pdf_manager.get_destinations().get(name)
        if dest:
            self.viewer.scroll_to(dest["page"], dest["y"])
            
    def show_list_menu(self, pos):
        item = self.list_destinations.itemAt(pos)
        if item:
            menu = QMenu()
            action_delete = menu.addAction("Excluir destino")
            action = menu.exec(self.list_destinations.mapToGlobal(pos))
            if action == action_delete:
                self.pdf_manager.remove_destination(item.text())
                self.update_list()

    def show_instructions(self):
        instrucoes = (
            "<h3>Como usar o Criador de Destinos em PDF</h3>"
            "<ol>"
            "<li>Clique em <b>'Abrir PDF'</b> para carregar o seu documento original.</li>"
            "<li>No campo <b>'Nº da última emenda de membro'</b>, informe o número da emenda que antecede a que você quer criar (se a próxima deve ser Emenda3, digite 2).</li>"
            "<li>No campo <b>'Sigla para emendas de relator'</b>, preencha a sigla desejada (ex: CMA). Ela será usada como padrão.</li>"
            "<li>No visualizador de PDF (lado direito), role até cada emenda de relator.</li>"
            "<li><b>Substituir Texto:</b> Se quiser substituir o título original, clique e <b>arraste com o botão esquerdo</b> sobre o texto (ex: 'EMENDA Nº - CMA') para selecioná-lo. Em seguida, clique com o <b>botão direito</b> DENTRO da área selecionada. Um modal permitirá confirmar o texto de substituição.</li>"
            "<li><b>Criar sem substituir:</b> Apenas clique com o botão direito em qualquer lugar da página.</li>"
            "<li><b>Selecione</b> 'Criar destino Emenda#' ou 'Criar destino de Subemenda...'. </li>"
            "<li>Se for o caso, edite o novo título antes de aplicar a substituição.</li>"
            "<li>O painel esquerdo ('Destinos Criados') lista todos os destinos. <b>Clique</b> neles para pular até aquele ponto no texto.</li>"
            "<li><b>Clicar com botão direito</b> em um destino no painel permite excluí-lo.</li>"
            "<li>Ao finalizar as marcações, clique em <b>'Salvar PDF/A (Final)'</b> para gerar o arquivo com os destinos e textos substituídos.</li>"
            "</ol>"
        )
        msg = QMessageBox(self)
        msg.setWindowTitle("Instruções de Uso")
        msg.setText(instrucoes)
        msg.exec()
