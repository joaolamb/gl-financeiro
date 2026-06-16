from flask import Blueprint, render_template, request
from flask_login import login_required
from models import LayoutDFC, Lancamento, Categoria, Setting
from extensions import db
from datetime import datetime
import json

bp_geral = Blueprint('geral', __name__)

@bp_geral.route('/')
@login_required
def home():
    ano_atual = datetime.now().year
    return render_template('home.html', ano_atual=ano_atual)

@bp_geral.route('/dfc')
@login_required
def index():
    ano = request.args.get('ano', datetime.now().year, type=int)
    
    layout = LayoutDFC.query.order_by(LayoutDFC.ordem).all()
    
    lancamentos = Lancamento.query.filter_by(ano=ano).all()
    dados = {}
    for l in lancamentos:
        if l.categoria_id not in dados:
            dados[l.categoria_id] = {}
        dados[l.categoria_id][l.mes] = l.valor

    setting = Setting.query.filter_by(chave='result_colors').first()
    result_colors = json.loads(setting.valor) if setting and setting.valor else {}

    return render_template('index.html', layout=layout, dados=dados, ano=ano, result_colors=result_colors)

@bp_geral.route('/dashboard')
@login_required
def dashboard():
    ano = request.args.get('ano', datetime.now().year, type=int)
    contas = Categoria.query.filter(Categoria.tipo != 'sistema').order_by(Categoria.codigo).all()
    return render_template('dashboard.html', ano=ano, contas=contas)