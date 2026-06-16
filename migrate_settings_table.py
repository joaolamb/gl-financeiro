"""
Migração: cria a tabela 'settings' (configurações compartilhadas),
usada para guardar as cores das linhas de resultado da DFC.

NÃO apaga nem altera nenhum dado existente — apenas cria a tabela nova
se ela ainda não existir.

Execute UMA VEZ no servidor (PythonAnywhere bash):
    python migrate_settings_table.py
"""

from app import create_app
from extensions import db
from models import Setting

app = create_app()

with app.app_context():
    # checkfirst=True: só cria se a tabela ainda não existir (idempotente)
    Setting.__table__.create(db.engine, checkfirst=True)
    print("✅ Tabela 'settings' pronta (criada ou já existente).")
