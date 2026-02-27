from flask import Blueprint, render_template, redirect, url_for, flash, request
from flask_login import login_user, logout_user, login_required, current_user
from models import User
from extensions import db

bp_auth = Blueprint('auth', __name__, url_prefix='/auth')

@bp_auth.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('geral.home'))
        
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username).first()
        
        if user and user.check_password(password):
            login_user(user)
            return redirect(url_for('geral.home'))
        else:
            flash('Usuário ou senha inválidos', 'error')
            
    return render_template('login.html')

@bp_auth.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('auth.login'))

@bp_auth.route('/users/create', methods=['POST'])
@login_required
def create_user():
    if not current_user.is_admin:
        return {"status": "error", "message": "Sem permissão"}, 403
        
    data = request.json
    if User.query.filter_by(username=data['username']).first():
        return {"status": "error", "message": "Usuário já existe"}
        
    user = User(username=data['username'], is_admin=False)
    user.set_password(data['password'])
    db.session.add(user)
    db.session.commit()
    return {"status": "ok", "message": "Usuário criado com sucesso!"}