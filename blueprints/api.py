from flask import Blueprint, request, jsonify
from extensions import db
from models import Lancamento, LayoutDFC, Categoria
from flask_login import login_required
from sqlalchemy import func
from unidecode import unidecode
import re

bp_api = Blueprint('api', __name__, url_prefix='/api')

def generate_slug(text):
    text = unidecode(text).lower()
    return re.sub(r'[\W_]+', '_', text).strip('_')

@bp_api.route('/atualizar', methods=['POST'])
@login_required
def atualizar():
    data = request.json
    try:
        cat_id = int(data.get('categoria_id'))
        mes = int(data.get('mes'))
        ano = int(data.get('ano', 2026)) 
        valor = float(data.get('valor', 0.0))

        lanc = Lancamento.query.filter_by(categoria_id=cat_id, mes=mes, ano=ano).first()
        if not lanc:
            lanc = Lancamento(categoria_id=cat_id, mes=mes, ano=ano, valor=valor)
            db.session.add(lanc)
        else:
            lanc.valor = valor
        
        db.session.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@bp_api.route('/create_master', methods=['POST'])
@login_required
def create_master():
    data = request.json
    texto = data.get('texto')
    grupo = generate_slug(texto)
    
    last = LayoutDFC.query.order_by(LayoutDFC.ordem.desc()).first()
    nova_ordem = (last.ordem + 1) if last else 1
    
    item = LayoutDFC(
        ordem=nova_ordem,
        tipo_linha='master',
        texto=texto,
        grupo_calculo=grupo
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({"status": "ok"})

@bp_api.route('/create_header', methods=['POST'])
@login_required
def create_header():
    data = request.json
    master_grupo = data.get('master_grupo')
    texto = data.get('texto')
    grupo_calculo = generate_slug(texto)
    
    items_do_master = LayoutDFC.query.filter_by(grupo_pai=master_grupo).all()
    
    if items_do_master:
        after_ordem = max([item.ordem for item in items_do_master])
    else:
        master = LayoutDFC.query.filter_by(grupo_calculo=master_grupo).first()
        after_ordem = master.ordem if master else 0

    db.session.query(LayoutDFC).filter(LayoutDFC.ordem > after_ordem).update(
        {LayoutDFC.ordem: LayoutDFC.ordem + 1}, synchronize_session=False
    )
    
    item = LayoutDFC(
        ordem=after_ordem + 1,
        tipo_linha='header',
        texto=texto,
        grupo_calculo=grupo_calculo,
        grupo_pai=master_grupo
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({"status": "ok"})

@bp_api.route('/create_conta', methods=['POST'])
@login_required
def create_conta():
    data = request.json
    header_id = data.get('header_layout_id')
    codigo = data.get('codigo')
    nome = data.get('nome')
    
    header = LayoutDFC.query.get(header_id)
    if not header:
        return jsonify({"status": "error", "message": "Header não encontrado"})
    
    # 1. VALIDAÇÃO DE CONTA DUPLICADA
    cat = Categoria.query.filter_by(codigo=codigo).first()
    if cat:
        return jsonify({
            "status": "error", 
            "message": f"O código '{codigo}' já está em uso pela conta '{cat.nome}'. Use outro código (ex: {codigo}-B)."
        })
    
    # Se não existe, cria normalmente
    cat = Categoria(codigo=codigo, nome=nome, tipo="operacional")
    db.session.add(cat)
    db.session.flush()
    
    items_do_grupo = LayoutDFC.query.filter_by(grupo_calculo=header.grupo_calculo).all()
    after_ordem = max([item.ordem for item in items_do_grupo]) if items_do_grupo else header.ordem
    
    db.session.query(LayoutDFC).filter(LayoutDFC.ordem > after_ordem).update(
        {LayoutDFC.ordem: LayoutDFC.ordem + 1}, synchronize_session=False
    )
    
    item = LayoutDFC(
        ordem=after_ordem + 1,
        tipo_linha='conta',
        categoria_id=cat.id,
        grupo_calculo=header.grupo_calculo,
        grupo_pai=header.grupo_pai 
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({"status": "ok", "cat_id": cat.id, "layout_id": item.id})

@bp_api.route('/delete_master', methods=['POST'])
@login_required
def delete_master():
    data = request.json
    layout_id = data.get('master_id')
    
    item = LayoutDFC.query.get(layout_id)
    if not item:
        return jsonify({"status": "error", "message": "Item não encontrado"})
        
    filhos = LayoutDFC.query.filter_by(grupo_pai=item.grupo_calculo).count()
    if filhos > 0:
        return jsonify({"status": "error", "message": "Categoria master não está vazia. Exclua as subcategorias primeiro."})
        
    db.session.delete(item)
    db.session.commit()
    return jsonify({"status": "ok"})

@bp_api.route('/delete_header', methods=['POST'])
@login_required
def delete_header():
    data = request.json
    layout_id = data.get('header_id') 
    
    item = LayoutDFC.query.get(layout_id)
    if not item:
        return jsonify({"status": "error", "message": "Item não encontrado"})
        
    filhos = LayoutDFC.query.filter_by(grupo_calculo=item.grupo_calculo, tipo_linha='conta').count()
    if filhos > 0:
        return jsonify({"status": "error", "message": "Subcategoria não está vazia. Exclua as contas primeiro."})
        
    db.session.delete(item)
    db.session.commit()
    return jsonify({"status": "ok"})

@bp_api.route('/delete_conta', methods=['POST'])
@login_required
def delete_conta():
    data = request.json
    layout_id = data.get('layout_id')
    item = LayoutDFC.query.get(layout_id)
    
    if not item:
        return jsonify({"status": "error", "message": "Item não encontrado"})

    # 2. VÁLVULA DE ESCAPE PARA CONTAS DUPLICADAS NO LAYOUT
    usos_no_layout = LayoutDFC.query.filter_by(categoria_id=item.categoria_id).count()

    # Se a conta estiver no layout APENAS UMA VEZ, não deixa excluir se tiver lançamentos.
    # Se estiver mais de uma vez (duplicada pelo bug), deixa excluir a linha livremente!
    if usos_no_layout <= 1:
        tem_lanc = Lancamento.query.filter_by(categoria_id=item.categoria_id).count()
        if tem_lanc > 0:
            return jsonify({"status": "error", "message": "Conta possui lançamentos financeiros. Exclusão bloqueada."})
        
    db.session.delete(item)
    db.session.commit()
    return jsonify({"status": "ok"})

@bp_api.route('/update_text', methods=['POST'])
@login_required
def update_text():
    data = request.json
    item = LayoutDFC.query.get(data.get('layout_id'))
    if item:
        item.texto = data.get('texto')
        db.session.commit()
        return jsonify({"status": "ok"})
    return jsonify({"status": "error"})


@bp_api.route('/update_conta', methods=['POST'])
@login_required
def update_conta():
    data = request.json
    cat_id = data.get('cat_id')
    codigo = data.get('codigo')
    nome = data.get('nome')

    cat = Categoria.query.get(cat_id)
    if not cat:
        return jsonify({"status": "error", "message": "Conta não encontrada"})

    # Valida se o novo código já existe em OUTRA conta
    existing = Categoria.query.filter_by(codigo=codigo).first()
    if existing and existing.id != cat.id:
        return jsonify({
            "status": "error", 
            "message": f"O código '{codigo}' já está em uso pela conta '{existing.nome}'."
        })

    cat.codigo = codigo
    cat.nome = nome
    db.session.commit()
    return jsonify({"status": "ok"})


@bp_api.route('/dashboard/data')
@login_required
def dashboard_data():
    ano1 = request.args.get('ano1', type=int)
    ano2 = request.args.get('ano2', type=int) 
    
    layout_items = LayoutDFC.query.order_by(LayoutDFC.ordem).all()
    layout_data = []
    
    for item in layout_items:
        cat_codigo = None
        cat_nome = None
        if item.categoria_id:
            cat = Categoria.query.get(item.categoria_id)
            if cat:
                cat_codigo = cat.codigo
                cat_nome = cat.nome

        layout_data.append({
            "id": item.id,
            "tipo_linha": item.tipo_linha,
            "texto": item.texto,
            "grupo_calculo": item.grupo_calculo,
            "grupo_pai": item.grupo_pai,
            "categoria_id": item.categoria_id,
            "cat_codigo": cat_codigo,
            "cat_nome": cat_nome
        })

    def get_lancamentos(ano):
        if not ano: return []
        rows = Lancamento.query.filter_by(ano=ano).all()
        return [{"cat_id": r.categoria_id, "mes": r.mes, "valor": r.valor} for r in rows if r.valor != 0]

    return jsonify({
        "status": "ok",
        "layout": layout_data,
        "data_ano1": get_lancamentos(ano1),
        "data_ano2": get_lancamentos(ano2)
    })