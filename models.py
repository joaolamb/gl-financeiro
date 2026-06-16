from extensions import db
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Categoria(db.Model):
    __tablename__ = 'categorias'
    id = db.Column(db.Integer, primary_key=True)
    codigo = db.Column(db.String(20), unique=True, nullable=False)
    nome = db.Column(db.String(150), nullable=False)
    tipo = db.Column(db.String(50), nullable=False)
    layout_items = db.relationship('LayoutDFC', backref='categoria', lazy=True)

class Lancamento(db.Model):
    __tablename__ = 'lancamentos'
    id = db.Column(db.Integer, primary_key=True)
    categoria_id = db.Column(db.Integer, db.ForeignKey('categorias.id'), nullable=False)
    ano = db.Column(db.Integer, nullable=False)
    mes = db.Column(db.Integer, nullable=False)
    valor = db.Column(db.Float, default=0.0)
    __table_args__ = (db.UniqueConstraint('categoria_id', 'mes', 'ano', name='_cat_mes_ano_uc'),)

class Setting(db.Model):
    __tablename__ = 'settings'
    id = db.Column(db.Integer, primary_key=True)
    chave = db.Column(db.String(80), unique=True, nullable=False)
    valor = db.Column(db.Text, nullable=True)

class LayoutDFC(db.Model):
    __tablename__ = 'layout_dfc'
    id = db.Column(db.Integer, primary_key=True)
    ordem = db.Column(db.Integer, nullable=False)
    tipo_linha = db.Column(db.String(20), nullable=False) 
    texto = db.Column(db.String(200), nullable=True)
    categoria_id = db.Column(db.Integer, db.ForeignKey('categorias.id'), nullable=True)
    grupo_calculo = db.Column(db.String(50), nullable=True)
    grupo_pai = db.Column(db.String(50), nullable=True) 
    id_total = db.Column(db.String(50), nullable=True) 
    estilo = db.Column(db.String(50), nullable=True)