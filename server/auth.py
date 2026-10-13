"""
Sistema de autenticação com JWT e HWID
"""

import os
os.environ["PASSLIB_BCRYPT_BACKEND"] = "bcrypt"

from datetime import datetime, timedelta, timezone
from typing import Optional
import bcrypt
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from database import get_db
from models import Operator

SECRET_KEY = "SUA_CHAVE_SECRETA_SUPER_SEGURA_AQUI_MUDAR_EM_PRODUCAO"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 dias

# OAuth2
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica senha"""
    # Trunca a senha para 72 bytes para evitar ValueError no bcrypt >= 4.0.0
    pwd_bytes = plain_password.encode("utf-8")[:72]
    hash_bytes = hashed_password.encode("utf-8") if isinstance(hashed_password, str) else hashed_password
    return bcrypt.checkpw(pwd_bytes, hash_bytes)


def get_password_hash(password: str) -> str:
    """Gera hash de senha"""
    # Trunca a senha para 72 bytes para evitar ValueError no bcrypt >= 4.0.0
    pwd_bytes = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pwd_bytes, bcrypt.gensalt()).decode("utf-8")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Cria token JWT"""
    to_encode = data.copy()
    
    # Atualizado para usar timezone-aware UTC
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Operator:
    """Obtém usuário atual do token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Não foi possível validar credenciais",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    operator = db.query(Operator).filter(Operator.username == username).first()
    if operator is None:
        raise credentials_exception
    
    # Verifica se está banido
    if operator.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sua conta foi banida. Contate o administrador."
        )
    
    # Verifica se está ativo
    if not operator.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sua conta está desativada."
        )
    
    return operator

def get_user_from_expired_token(token: str, db: Session) -> Optional[Operator]:
    """
    Obtém usuário mesmo de token expirado (para refresh).
    Valida assinatura mas ignora expiração.
    """
    try:
        # Decodifica ignorando expiração
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
        username: str = payload.get("sub")
        if username is None:
            return None
        
        operator = db.query(Operator).filter(Operator.username == username).first()
        if operator is None:
            return None
        
        # Verifica se está banido
        if operator.is_banned:
            return None
        
        # Verifica se está ativo
        if not operator.is_active:
            return None
        
        return operator
    except JWTError:
        return None

def get_current_admin(current_user: Operator = Depends(get_current_user)) -> Operator:
    """Verifica se usuário atual é admin"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Apenas administradores."
        )
    return current_user
def authenticate_user(db: Session, username: str, password: str) -> Optional[Operator]:
    """Autentica usuário"""
    operator = db.query(Operator).filter(Operator.username == username).first()
    if not operator:
        return None
    if not verify_password(password, operator.hashed_password):
        return None
    return operator
def validate_hwid(operator: Operator, hwid: str) -> bool:
    """Valida HWID do usuário"""
    # Se não tem HWID registrado, precisa ativar
    if operator.hwid is None:
        return False
    # Verifica se HWID bate
    return operator.hwid == hwid
def activate_hwid(db: Session, operator: Operator, hwid: str) -> bool:
    """Ativa HWID para o usuário"""
    # Verifica se já tem HWID
    if operator.hwid is not None:
        return False
    
    # Verifica se HWID já está em uso por outro usuário
    existing = db.query(Operator).filter(Operator.hwid == hwid, Operator.id != operator.id).first()
    if existing:
        return False
    
    # Ativa HWID
    operator.hwid = hwid
    operator.hwid_activated_at = datetime.now(timezone.utc)   # atualizado para timezone-aware
    db.commit()
    return True