import os
import subprocess
import sys

def build():
    print("Iniciando build com PyInstaller...")
    
    # Determinar qual comando usar dependendo se estamos no venv
    pyinstaller_cmd = "pyinstaller"
    
    try:
        subprocess.run([
            pyinstaller_cmd,
            "main.py",
            "--name=DestinosPDF",
            "--onefile",
            "--windowed",
            "--icon=hand-point.png",
            "--add-data=hand-point.png:.",
            "--clean"
        ], check=True)
        print("Build concluído com sucesso! O executável está na pasta 'dist'.")
    except subprocess.CalledProcessError as e:
        print(f"Erro durante o build: {e}")
    except FileNotFoundError:
        print("PyInstaller não encontrado. Certifique-se de instalar as dependências com 'pip install -r requirements.txt'")

if __name__ == "__main__":
    build()
