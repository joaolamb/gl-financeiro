from flask import Blueprint, render_template, request, redirect, url_for, flash
from models import Categoria
from extensions import db
from flask_login import login_required

bp_categorias = Blueprint('categorias', __name__, url_prefix='/categorias')

@bp_categorias.route('/', methods=['GET', 'POST'])
@login_required
def listar():
    if request.method == 'POST':
        codigo = request.form.get('codigo')
        nome = request.form.get('nome')
        tipo = request.form.get('tipo', 'sistema')
        
        if Categoria.query.filter_by(codigo=codigo).first():
            flash('Código já existe!', 'error')
        else:
            nova = Categoria(codigo=codigo, nome=nome, tipo=tipo)
            db.session.add(nova)
            db.session.commit()
            flash('Categoria adicionada!', 'success')
        return redirect(url_for('categorias.listar'))
    
    cats = Categoria.query.all()
    return render_template('categorias.html', categorias=cats)
    
@bp_categorias.route('/deletar/<int:id>')
@login_required
def deletar(id):
    cat = Categoria.query.get_or_404(id)
    db.session.delete(cat)
    db.session.commit()
    flash('Categoria deletada.', 'success')
    return redirect(url_for('categorias.listar'))