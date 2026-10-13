"""
Script para inicializar o banco de dados automaticamente
"""
import sys
from urllib.parse import urlparse

import hydra_env


def _postgres_admin_conninfo() -> dict:
    parsed = urlparse(hydra_env.database_url())
    return {
        "host": parsed.hostname or "localhost",
        "user": parsed.username or "postgres",
        "password": parsed.password or "",
        "database": "postgres",
        "port": parsed.port or 5432,
    }


def _target_db_name() -> str:
    parsed = urlparse(hydra_env.database_url())
    path = (parsed.path or "/rat_db").lstrip("/")
    return path or "rat_db"


def init_database():
    """Cria o banco de dados se não existir"""
    import psycopg2
    from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
    db_name = _target_db_name()
    try:
        conn = psycopg2.connect(**_postgres_admin_conninfo())
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()
        
        # Verifica se banco existe
        cursor.execute("SELECT 1 FROM pg_database WHERE datname=%s", (db_name,))
        exists = cursor.fetchone()
        
        if not exists:
            print(f"📦 Criando banco de dados '{db_name}'...")
            cursor.execute(f'CREATE DATABASE "{db_name}"')
            print("✅ Banco de dados criado com sucesso!")
        else:
            print(f"✅ Banco de dados '{db_name}' já existe")
        
        cursor.close()
        conn.close()
        
        # Cria as tabelas usando SQLAlchemy
        print("📋 Criando tabelas...")
        from database import engine, Base
        Base.metadata.create_all(bind=engine)
        print("✅ Tabelas criadas com sucesso!")
        
        # Cria admin padrão se não existir
        create_default_admin()
        
        return True
        
    except psycopg2.OperationalError as e:
        print(f"❌ Erro ao conectar ao PostgreSQL: {e}")
        print("Certifique-se de que:")
        print("  1. PostgreSQL está rodando")
        print("  2. Usuário 'postgres' não tem senha configurada")
        print("  3. pg_hba.conf permite conexões locais sem senha (trust)")
        return False
    except Exception as e:
        print(f"❌ Erro: {e}")
        return False

def create_default_admin():
    """Cria usuário admin padrão"""
    from database import SessionLocal
    from models import Operator
    from auth import get_password_hash
    
    db = SessionLocal()
    try:
        # Verifica se já existe admin
        admin = db.query(Operator).filter(Operator.username == "admin").first()
        
        if not admin:
            print("👤 Criando usuário admin padrão...")
            admin = Operator(
                username="admin",
                email="admin@rat.local",
                hashed_password=get_password_hash("admin"),
                is_admin=True,
                is_active=True,
                hwid=None  # Admin não precisa de HWID
            )
            db.add(admin)
            db.commit()
            print("✅ Admin criado!")
            print("   Usuário: admin")
            print("   Senha: admin")
            print("   ⚠️ MUDE A SENHA APÓS O PRIMEIRO LOGIN!")
        else:
            # Garante que o admin existente tem is_admin=True e sem HWID
            if not admin.is_admin:
                admin.is_admin = True
                db.commit()
                print("✅ Admin atualizado com permissões de administrador")
            else:
                print("✅ Admin já existe")
    finally:
        db.close()

if __name__ == "__main__":
    success = init_database()
    sys.exit(0 if success else 1)
