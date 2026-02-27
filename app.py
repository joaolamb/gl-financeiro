import os
from flask import Flask
from extensions import db, login_manager
from models import User, Categoria, LayoutDFC


def create_app():
    app = Flask(__name__, instance_relative_config=True)

    # garante a pasta instance/
    os.makedirs(app.instance_path, exist_ok=True)

    # usa o banco dentro de instance/financeiro.db
    db_path = os.path.join(app.instance_path, "financeiro.db")
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # em produção, coloque SECRET_KEY em variável de ambiente
    app.secret_key = os.getenv("SECRET_KEY", "segredo_financeiro_absoluto_pro")

    db.init_app(app)
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    from blueprints.auth import bp_auth
    from blueprints.geral import bp_geral
    from blueprints.api import bp_api
    from blueprints.categorias import bp_categorias

    app.register_blueprint(bp_auth)
    app.register_blueprint(bp_geral)
    app.register_blueprint(bp_api)
    app.register_blueprint(bp_categorias)

    return app


app = create_app()


@app.cli.command("create-admin")
def create_admin():
    username = input("Username do Admin: ")
    password = input("Senha do Admin: ")
    with app.app_context():
        if User.query.filter_by(username=username).first():
            print("Usuário já existe!")
            return
        user = User(username=username, is_admin=True)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        print(f"Administrador '{username}' criado com sucesso!")


@app.cli.command("setup-db")
def setup_db():
    with app.app_context():
        db.drop_all()
        db.create_all()
        print("Banco reiniciado.")

        # ESTRUTURA DA TUPLA:
        # (TIPO, Codigo_ou_Texto, GRUPO_ATUAL, Nome_Conta_ou_None, GRUPO_PAI)

        layout_map = [
            # === 1. MASTER: RECEBIMENTOS (Receita Líquida) ===
            ("master", "1. RECEBIMENTOS (Receita Líquida)", "grp_recebimentos", None, None),

                ("header", "Receitas Diretas", "rec_direta", None, "grp_recebimentos"),
                ("conta", "1001", "rec_direta", "Honorários Contábeis", "grp_recebimentos"),
                ("conta", "1002", "rec_direta", "Honorários Departamento Pessoal", "grp_recebimentos"),
                ("conta", "1003", "rec_direta", "Honorários BPO Financeiro", "grp_recebimentos"),
                ("conta", "1004", "rec_direta", "Honorários - Domicílio Judicial Eletrônico", "grp_recebimentos"),
                ("conta", "1005", "rec_direta", "Honorários - Domicílio Eletrônico Trabalhista", "grp_recebimentos"),
                ("conta", "1006", "rec_direta", "Honorários Extras", "grp_recebimentos"),
                ("conta", "1007", "rec_direta", "Honorários IRPF", "grp_recebimentos"),

                ("header", "Receitas Indiretas", "rec_indireta", None, "grp_recebimentos"),
                ("conta", "1006-B", "rec_indireta", "Capital de Giro - Empréstimos", "grp_recebimentos"),
                ("conta", "1007-B", "rec_indireta", "Parceria - Líder", "grp_recebimentos"),
                ("conta", "1008", "rec_indireta", "Parceria - OMIE", "grp_recebimentos"),
                ("conta", "1009", "rec_indireta", "Parceria - VR", "grp_recebimentos"),
                ("conta", "1010", "rec_indireta", "Outras Entradas", "grp_recebimentos"),

                ("header", "(-) Deduções s/ Vendas", "deducoes", None, "grp_recebimentos"),
                ("conta", "2001", "deducoes", "(-) PIS", "grp_recebimentos"),
                ("conta", "2002", "deducoes", "(-) COFINS", "grp_recebimentos"),
                ("conta", "2003", "deducoes", "(-) IPI", "grp_recebimentos"),
                ("conta", "2004", "deducoes", "(-) ICMS", "grp_recebimentos"),
                ("conta", "2005", "deducoes", "(-) ICMS ST", "grp_recebimentos"),
                ("conta", "2006", "deducoes", "(-) DAS Simples Nacional", "grp_recebimentos"),
                ("conta", "2007", "deducoes", "(-) ISS", "grp_recebimentos"),
                ("conta", "2020", "deducoes", "(-) Devolução De Vendas", "grp_recebimentos"),

            # === 2. MASTER: CUSTOS VARIAVEIS ===
            ("master", "2. CUSTOS E DESPESAS VARIÁVEIS", "grp_custos_var", None, None),

                ("header", "Despesas Variáveis", "desp_var", None, "grp_custos_var"),
                ("conta", "3102", "desp_var", "Despesas Reembolsáveis - CLIENTES (débito)", "grp_custos_var"),

                ("header", "Recuperação de Despesas", "rec_desp", None, "grp_custos_var"),
                ("conta", "3111", "rec_desp", "Reembolso Despesas - CLIENTES (crédito)", "grp_custos_var"),

                ("header", "Custos dos Serviços Vendidos (CSV)", "custos", None, "grp_custos_var"),
                ("conta", "3001", "custos", "ECONET", "grp_custos_var"),
                ("conta", "3002", "custos", "NUCONT", "grp_custos_var"),
                ("conta", "3003", "custos", "SIEG", "grp_custos_var"),
                ("conta", "3004", "custos", "MARKETING", "grp_custos_var"),
                ("conta", "3005", "custos", "SAGE", "grp_custos_var"),
                ("conta", "3006", "custos", "SESCAP", "grp_custos_var"),
                ("conta", "3007", "custos", "COAD", "grp_custos_var"),
                ("conta", "3008", "custos", "Despesas NÃO reembolsáveis - CLIENTES", "grp_custos_var"),
                ("conta", "3009", "custos", "CRC", "grp_custos_var"),
                ("conta", "3010", "custos", "API", "grp_custos_var"),
                ("conta", "3011", "custos", "Honorários Consultoria Fiscal", "grp_custos_var"),
                ("conta", "3012", "custos", "Honorários Contábeis (PJ)", "grp_custos_var"),
                ("conta", "3013", "custos", "DOMÍNIO", "grp_custos_var"),

            ("total", "(=) MCB - Margem de Contribuição Bruta", "mcb", "blue", None),

            # === 3. MASTER: DESPESAS OPERACIONAIS ===
            ("master", "3. DESPESAS OPERACIONAIS", "grp_desp_op", None, None),

                ("header", "Folha de Pagamento", "folha", None, "grp_desp_op"),
                ("conta", "3201", "folha", "Salários", "grp_desp_op"),
                ("conta", "3202", "folha", "INSS", "grp_desp_op"),
                ("conta", "3203", "folha", "FGTS", "grp_desp_op"),
                ("conta", "3204", "folha", "IRRF Folha", "grp_desp_op"),
                ("conta", "3205", "folha", "Férias", "grp_desp_op"),
                ("conta", "3206", "folha", "Rescisões", "grp_desp_op"),
                ("conta", "3207", "folha", "13º Salário", "grp_desp_op"),
                ("conta", "3208", "folha", "Bolsa Auxílio (Estagiário)", "grp_desp_op"),

                ("header", "Outras Despesas com Pessoal", "outras_pessoal", None, "grp_desp_op"),
                ("conta", "3211", "outras_pessoal", "Vale Refeição/Alimentação", "grp_desp_op"),
                ("conta", "3212", "outras_pessoal", "Vale Transporte", "grp_desp_op"),
                ("conta", "3213", "outras_pessoal", "Seguro De Vida", "grp_desp_op"),
                ("conta", "3216", "outras_pessoal", "Uniformes", "grp_desp_op"),
                ("conta", "3217", "outras_pessoal", "Saúde Ocupacional", "grp_desp_op"),
                ("conta", "3218", "outras_pessoal", "Assistência Odontológica", "grp_desp_op"),
                ("conta", "3219", "outras_pessoal", "Plano de Saúde", "grp_desp_op"),
                ("conta", "3220", "outras_pessoal", "Ponto Online", "grp_desp_op"),

                ("header", "Estrutura e Localização", "estrutura", None, "grp_desp_op"),
                ("conta", "3301", "estrutura", "Energia Elétrica Adm", "grp_desp_op"),
                ("conta", "3302", "estrutura", "Aluguel", "grp_desp_op"),
                ("conta", "3303", "estrutura", "Condomínio", "grp_desp_op"),
                ("conta", "3304", "estrutura", "Seguro Predial", "grp_desp_op"),
                ("conta", "3305", "estrutura", "IPTU", "grp_desp_op"),
                ("conta", "3306", "estrutura", "Manutenção das Instalações", "grp_desp_op"),

                ("header", "Despesas com Veículos", "veiculos", None, "grp_desp_op"),
                ("conta", "3311", "veiculos", "Combustível", "grp_desp_op"),
                ("conta", "3316", "veiculos", "Seguro De Veículos", "grp_desp_op"),
                ("conta", "3317", "veiculos", "Manutenção de Veículos", "grp_desp_op"),
                ("conta", "3318", "veiculos", "IPVA/Licenciameto/DPVAT/Multas", "grp_desp_op"),

                ("header", "Serviços de Terceiros", "terceiros", None, "grp_desp_op"),
                ("conta", "3321", "terceiros", "Honorários Contábeis", "grp_desp_op"),
                ("conta", "3322", "terceiros", "Honorários Advocatícios", "grp_desp_op"),
                ("conta", "3323", "terceiros", "Honorários Consultoria", "grp_desp_op"),
                ("conta", "3324", "terceiros", "Serviços de Recrutamento e Seleção", "grp_desp_op"),

                ("header", "Material de Consumo/Expediente", "consumo", None, "grp_desp_op"),
                ("conta", "3331", "consumo", "Material de Copa/Cozinha/Limpeza", "grp_desp_op"),
                ("conta", "3332", "consumo", "Material de Escritório", "grp_desp_op"),

                ("header", "Informática", "informatica", None, "grp_desp_op"),
                ("conta", "3341", "informatica", "Serviços de Informática (mensalidade)", "grp_desp_op"),
                ("conta", "3342", "informatica", "Licença de Uso de Software", "grp_desp_op"),
                ("conta", "3343", "informatica", "Manutenção Informática", "grp_desp_op"),

                ("header", "Marketing", "marketing", None, "grp_desp_op"),
                ("conta", "3151", "marketing", "Brindes (Clientes)", "grp_desp_op"),
                ("conta", "3152", "marketing", "Material Gráfico/Mídias Sociais", "grp_desp_op"),
                ("conta", "3153", "marketing", "Eventos", "grp_desp_op"),

                ("header", "Comunicação", "comunicacao", None, "grp_desp_op"),
                ("conta", "3361", "comunicacao", "Internet", "grp_desp_op"),
                ("conta", "3362", "comunicacao", "Telefonia Fixa", "grp_desp_op"),
                ("conta", "3363", "comunicacao", "Telefonia Móvel", "grp_desp_op"),

                ("header", "Outras Despesas", "outras_desp", None, "grp_desp_op"),
                ("conta", "3371", "outras_desp", "Assinatura Digital", "grp_desp_op"),
                ("conta", "3372", "outras_desp", "Impressões/Encadernações", "grp_desp_op"),
                ("conta", "3373", "outras_desp", "Diarista", "grp_desp_op"),
                ("conta", "3374", "outras_desp", "Assinatura Jornais/Revistas", "grp_desp_op"),
                ("conta", "3375", "outras_desp", "Cursos /Treinamentos/Congressos", "grp_desp_op"),
                ("conta", "3376", "outras_desp", "Manutenção Móveis e Equipamentos", "grp_desp_op"),
                ("conta", "3377", "outras_desp", "Net TV", "grp_desp_op"),
                ("conta", "3378", "outras_desp", "Estacionamento", "grp_desp_op"),
                ("conta", "3379", "outras_desp", "Uber", "grp_desp_op"),
                ("conta", "3380", "outras_desp", "Brindes - Boas Vindas", "grp_desp_op"),
                ("conta", "3381", "outras_desp", "Cartório/Taxas e Correios", "grp_desp_op"),
                ("conta", "3382", "outras_desp", "Marcas e Patentes", "grp_desp_op"),
                ("conta", "3383", "outras_desp", "Seguro de Responsabilidade Civil", "grp_desp_op"),
                ("conta", "3384", "outras_desp", "Reembolso KM", "grp_desp_op"),
                ("conta", "3385", "outras_desp", "Anuidade Associativa", "grp_desp_op"),
                ("conta", "3386", "outras_desp", "Confraternizações", "grp_desp_op"),
                ("conta", "3399", "outras_desp", "Outros", "grp_desp_op"),

                ("header", "Despesas Bancárias", "bancarias", None, "grp_desp_op"),
                ("conta", "3601", "bancarias", "Tarifas Bancárias", "grp_desp_op"),

            ("total", "(=) EBITDA - Lucro Operacional", "ebitda", "blue", None),

            # === 4. MASTER: RESULTADO FINANCEIRO ===
            ("master", "4. RESULTADO FINANCEIRO", "grp_financeiro", None, None),

                ("header", "Despesas Financeiras", "fin_saida", None, "grp_financeiro"),
                ("conta", "3701", "fin_saida", "Juros Limite Conta", "grp_financeiro"),
                ("conta", "3702", "fin_saida", "IOF", "grp_financeiro"),
                ("conta", "3703", "fin_saida", "Multas", "grp_financeiro"),
                ("conta", "3704", "fin_saida", "Descontos Concedidos", "grp_financeiro"),

                ("header", "Receitas Financeiras", "fin_entrada", None, "grp_financeiro"),
                ("conta", "3711", "fin_entrada", "Descontos Obtidos", "grp_financeiro"),
                ("conta", "3712", "fin_entrada", "Juros Recebidos", "grp_financeiro"),
                ("conta", "3713", "fin_entrada", "Rendimento Aplicações", "grp_financeiro"),

            ("total", "(=) LAIR - Lucro Antes IRPJ/CSLL", "lair", "gray", None),

            # === 5. MASTER: IMPOSTOS ===
            ("master", "5. IRPJ E CSLL", "grp_impostos", None, None),
                ("header", "Impostos s/ Lucro", "impostos", None, "grp_impostos"),
                ("conta", "2008", "impostos", "(-) IRPJ", "grp_impostos"),
                ("conta", "2009", "impostos", "(-) CSLL", "grp_impostos"),

            # === 6. MASTER: SÓCIOS ===
            ("master", "6. SÓCIOS", "grp_socios", None, None),
                ("header", "Movimentação de Sócios", "socios", None, "grp_socios"),
                ("conta", "3501", "socios", "Pró Labore", "grp_socios"),
                ("conta", "3502", "socios", "Retiradas", "grp_socios"),

            ("total", "(=) Geração Bruta de Caixa", "geracao_bruta", "gray", None),

            # === 7. MASTER: INVESTIMENTOS ===
            ("master", "7. INVESTIMENTOS (CAPEX)", "grp_capex", None, None),
                ("header", "Aquisições", "capex", None, "grp_capex"),
                ("conta", "4001", "capex", "Equipamentos de Informática", "grp_capex"),
                ("conta", "4002", "capex", "Consórcios", "grp_capex"),
                ("conta", "4003", "capex", "Veículos", "grp_capex"),
                ("conta", "4004", "capex", "Licença de Uso de Software (Compra)", "grp_capex"),
                ("conta", "4005", "capex", "Móveis", "grp_capex"),
                ("conta", "4006", "capex", "Instalações", "grp_capex"),
                ("conta", "4007", "capex", "Bens de Pequeno Valor", "grp_capex"),

            ("total", "(=) Geração Líquida de Caixa", "geracao_liquida", "blue", None),

            # === 8. MASTER: EMPRÉSTIMOS ===
            ("master", "8. EMPRÉSTIMOS E FINANCIAMENTOS", "grp_emprestimos", None, None),
                ("header", "Pagamentos (Amortização + Juros)", "emp_saida", None, "grp_emprestimos"),
                ("conta", "3801", "emp_saida", "Giro Pronampe", "grp_emprestimos"),
                ("conta", "3802", "emp_saida", "Pagamento Empréstimo PEAC FGI", "grp_emprestimos"),
                ("conta", "3803", "emp_saida", "Empréstimos", "grp_emprestimos"),
                ("conta", "3806", "emp_saida", "Parcelamento Simples Nacional (DAS)", "grp_emprestimos"),

                ("header", "Entradas (Mútuos/Capital)", "emp_entrada", None, "grp_emprestimos"),
                ("conta", "3805", "emp_entrada", "Mútuo - LIMAGE", "grp_emprestimos"),
                ("conta", "3806-B", "emp_entrada", "Mútuo - GERSON", "grp_emprestimos"),

            ("total", "(=) SALDO FINAL DE CAIXA", "saldo_final", "blue_dark", None),
        ]

        # === INSERÇÃO ===
        count_ordem = 1
        for tipo, param1, param2, param3, param4 in layout_map:
            texto = None
            grupo = None
            id_total = None
            estilo = None
            cat_id = None
            grupo_pai = None

            if tipo == "master":
                texto = param1
                grupo = param2

            elif tipo == "header":
                texto = param1
                grupo = param2
                grupo_pai = param4

            elif tipo == "conta":
                codigo = param1
                grupo = param2
                nome_conta = param3
                grupo_pai = param4

                cat = Categoria.query.filter_by(codigo=codigo).first()
                if not cat:
                    cat = Categoria(codigo=codigo, nome=nome_conta, tipo="sistema")
                    db.session.add(cat)
                    db.session.flush()

                cat_id = cat.id

            elif tipo == "total":
                texto = param1
                id_total = param2
                estilo = param3

            item_layout = LayoutDFC(
                ordem=count_ordem,
                tipo_linha=tipo,
                texto=texto,
                grupo_calculo=grupo,
                id_total=id_total,
                estilo=estilo,
                categoria_id=cat_id,
                grupo_pai=grupo_pai,
            )

            db.session.add(item_layout)
            count_ordem += 1

        db.session.commit()
        print("Banco de dados configurado com hierarquia Master > Header > Conta!")


if __name__ == "__main__":
    app.run(debug=True)