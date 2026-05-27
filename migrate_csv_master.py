"""
Migração: move "Custos dos Serviços Vendidos (CSV)" de header dentro de
grp_custos_var para uma categoria master própria (grp_csv).

Execute UMA VEZ no servidor (PythonAnywhere bash):
    python migrate_csv_master.py
"""

from app import create_app
from extensions import db
from models import LayoutDFC
from sqlalchemy import text

app = create_app()

with app.app_context():
    with db.engine.begin() as conn:

        # 1. Verificar se a migração já foi aplicada
        result = conn.execute(
            text("SELECT COUNT(*) FROM layout_dfc WHERE tipo_linha='master' AND grupo_calculo='grp_csv'")
        ).scalar()

        if result > 0:
            print("✅ Migração já foi aplicada anteriormente. Nada a fazer.")
            exit(0)

        # 2. Encontrar a ordem do header 'custos' para inserir o master antes dele
        custos_header = conn.execute(
            text("SELECT ordem FROM layout_dfc WHERE tipo_linha='header' AND grupo_calculo='custos' LIMIT 1")
        ).fetchone()

        if not custos_header:
            print("❌ Header 'custos' não encontrado. Verifique o banco de dados.")
            exit(1)

        ordem_custos = custos_header[0]
        print(f"Header 'custos' encontrado na ordem {ordem_custos}")

        # 3. Abrir espaço: incrementar ordem de todos os itens >= ordem_custos
        conn.execute(
            text("UPDATE layout_dfc SET ordem = ordem + 1 WHERE ordem >= :o"),
            {"o": ordem_custos}
        )
        print(f"Ordens >= {ordem_custos} deslocadas +1")

        # 4. Inserir novo master grp_csv na posição liberada
        conn.execute(
            text("""
                INSERT INTO layout_dfc (ordem, tipo_linha, texto, categoria_id, grupo_calculo, grupo_pai, id_total, estilo)
                VALUES (:ordem, 'master', 'Custos dos Serviços Vendidos (CSV)', NULL, 'grp_csv', NULL, NULL, NULL)
            """),
            {"ordem": ordem_custos}
        )
        print("Master 'grp_csv' inserido")

        # 5. Atualizar header 'custos': pai passa de grp_custos_var → grp_csv
        conn.execute(
            text("UPDATE layout_dfc SET grupo_pai='grp_csv' WHERE tipo_linha='header' AND grupo_calculo='custos'")
        )
        print("Header 'custos' atualizado para grupo_pai='grp_csv'")

        # 6. Atualizar todas as contas filhas de 'custos': pai passa de grp_custos_var → grp_csv
        rows = conn.execute(
            text("UPDATE layout_dfc SET grupo_pai='grp_csv' WHERE tipo_linha='conta' AND grupo_calculo='custos' AND grupo_pai='grp_custos_var'")
        )
        print(f"Contas de 'custos' atualizadas para grupo_pai='grp_csv'")

    print("\n✅ Migração concluída com sucesso!")
    print("   - 'Custos dos Serviços Vendidos (CSV)' agora é um master próprio (grp_csv)")
    print("   - 'grp_custos_var' contém apenas Despesas Variáveis e Recuperação de Despesas")
