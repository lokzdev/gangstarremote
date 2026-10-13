"""
Configuracao do banco de dados — PostgreSQL (VPS).
"""

import hydra_env  # noqa: F401 — bootstrap env antes do engine

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = hydra_env.database_url()

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(DATABASE_URL, echo=False)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Fornece sessao do banco de dados."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
