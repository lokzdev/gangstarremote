"""
🔐 INTEGRAÇÃO TELEGRAM CRYPTER
Envia APKs para @android_protect_bot via Telegram Userbot

O usuário loga com seu número de telefone e o sistema:
1. Envia o APK gerado para o bot @android_protect_bot
2. Aguarda o bot processar e devolver o APK criptografado
3. Baixa automaticamente o APK criptografado
"""

import os
import asyncio
import logging
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional, Callable
import json

try:
    from telethon import TelegramClient, events  # type: ignore
    from telethon.sessions import StringSession  # type: ignore
    from telethon.errors import SessionPasswordNeededError, PhoneCodeInvalidError  # type: ignore
    TELETHON_AVAILABLE = True
except Exception:
    TELETHON_AVAILABLE = False
    TelegramClient = None
    events = None
    StringSession = None
    SessionPasswordNeededError = Exception
    PhoneCodeInvalidError = Exception

logger = logging.getLogger(__name__)

# Diretório para armazenar sessões e configurações
TELEGRAM_DIR = Path(__file__).parent / "telegram_data"
TELEGRAM_DIR.mkdir(exist_ok=True)

CONFIG_FILE = TELEGRAM_DIR / "config.json"
SESSION_FILE = TELEGRAM_DIR / "session.txt"

# 🔐 BOT DE CRYPTER PRÉ-CONFIGURADO
DEFAULT_CRYPTER_BOT = "android_protect_bot"

class TelegramCrypter:
    """
    Cliente Telegram para enviar APKs para bot de crypter
    """
    
    def __init__(self):
        self.client: Optional["TelegramClient"] = None
        self.config = self._load_config()
        self.is_connected = False
        self.is_waiting_code = False
        self.is_waiting_password = False
        self.pending_response: Optional[asyncio.Future] = None
        self.crypted_apk_path: Optional[str] = None
        
    def _load_config(self) -> dict:
        """Carrega configuração do arquivo"""
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, 'r') as f:
                    return json.load(f)
            except:
                pass
        return {
            "api_id": "",
            "api_hash": "",
            "phone": "",
            "bot_username": DEFAULT_CRYPTER_BOT,  # @android_protect_bot
            "session_string": ""
        }
    
    def _save_config(self):
        """Salva configuração no arquivo"""
        with open(CONFIG_FILE, 'w') as f:
            json.dump(self.config, f, indent=2)
    
    def configure(self, api_id: str, api_hash: str, phone: str, bot_username: str):
        """Configura credenciais do Telegram"""
        self.config["api_id"] = api_id
        self.config["api_hash"] = api_hash
        self.config["phone"] = phone
        self.config["bot_username"] = bot_username.lstrip("@")
        self._save_config()
        logger.info(f"✅ Telegram configurado: {phone} → @{self.config['bot_username']}")
    
    async def start_login(self) -> dict:
        """
        Inicia processo de login
        Retorna: {"status": "code_sent"} ou {"status": "error", "message": "..."}
        """
        if not TELETHON_AVAILABLE:
            return {"status": "error", "message": "telethon not installed on server"}

        if not self.config["api_id"] or not self.config["api_hash"]:
            return {"status": "error", "message": "API ID e API Hash não configurados"}
        
        if not self.config["phone"]:
            return {"status": "error", "message": "Número de telefone não configurado"}
        
        try:
            # Cria cliente
            self.client = TelegramClient(
                StringSession(self.config.get("session_string", "")),
                int(self.config["api_id"]),
                self.config["api_hash"]
            )
            
            await self.client.connect()
            
            # Verifica se já está logado
            if await self.client.is_user_authorized():
                self.is_connected = True
                me = await self.client.get_me()
                logger.info(f"✅ Já logado como: {me.first_name} ({me.phone})")
                return {"status": "already_logged", "user": me.first_name, "phone": me.phone}
            
            # Envia código
            await self.client.send_code_request(self.config["phone"])
            self.is_waiting_code = True
            logger.info(f"📱 Código enviado para: {self.config['phone']}")
            return {"status": "code_sent", "phone": self.config["phone"]}
            
        except Exception as e:
            logger.error(f"❌ Erro ao iniciar login: {e}")
            return {"status": "error", "message": str(e)}
    
    async def submit_code(self, code: str) -> dict:
        """
        Envia código de verificação
        """
        if not TELETHON_AVAILABLE:
            return {"status": "error", "message": "telethon not installed on server"}

        if not self.client:
            return {"status": "error", "message": "Cliente não inicializado"}
        
        try:
            await self.client.sign_in(self.config["phone"], code)
            
            # Salva sessão
            self.config["session_string"] = self.client.session.save()
            self._save_config()
            
            self.is_connected = True
            self.is_waiting_code = False
            me = await self.client.get_me()
            logger.info(f"✅ Login bem sucedido: {me.first_name}")
            return {"status": "success", "user": me.first_name, "phone": me.phone}
            
        except SessionPasswordNeededError:
            self.is_waiting_code = False
            self.is_waiting_password = True
            return {"status": "password_needed"}
            
        except PhoneCodeInvalidError:
            return {"status": "error", "message": "Código inválido"}
            
        except Exception as e:
            logger.error(f"❌ Erro ao enviar código: {e}")
            return {"status": "error", "message": str(e)}
    
    async def submit_password(self, password: str) -> dict:
        """
        Envia senha 2FA
        """
        if not TELETHON_AVAILABLE:
            return {"status": "error", "message": "telethon not installed on server"}

        if not self.client:
            return {"status": "error", "message": "Cliente não inicializado"}
        
        try:
            await self.client.sign_in(password=password)
            
            # Salva sessão
            self.config["session_string"] = self.client.session.save()
            self._save_config()
            
            self.is_connected = True
            self.is_waiting_password = False
            me = await self.client.get_me()
            logger.info(f"✅ Login 2FA bem sucedido: {me.first_name}")
            return {"status": "success", "user": me.first_name, "phone": me.phone}
            
        except Exception as e:
            logger.error(f"❌ Erro ao enviar senha: {e}")
            return {"status": "error", "message": str(e)}
    
    async def connect(self) -> bool:
        """
        Conecta usando sessão salva
        """
        if not TELETHON_AVAILABLE:
            logger.warning("telethon not available: telegram features disabled")
            return False

        if not self.config.get("session_string"):
            logger.warning("⚠️ Sem sessão salva, precisa fazer login")
            return False
        
        try:
            self.client = TelegramClient(
                StringSession(self.config["session_string"]),
                int(self.config["api_id"]),
                self.config["api_hash"]
            )
            
            await self.client.connect()
            
            if await self.client.is_user_authorized():
                self.is_connected = True
                me = await self.client.get_me()
                logger.info(f"✅ Conectado como: {me.first_name}")
                return True
            else:
                logger.warning("⚠️ Sessão expirada, precisa fazer login novamente")
                return False
                
        except Exception as e:
            logger.error(f"❌ Erro ao conectar: {e}")
            return False
    
    async def disconnect(self):
        """Desconecta do Telegram"""
        if not TELETHON_AVAILABLE:
            return

        if self.client:
            await self.client.disconnect()
            self.is_connected = False
            logger.info("📴 Desconectado do Telegram")
    
    async def send_apk_for_crypting(
        self, 
        apk_path: str, 
        timeout: int = 300,
        progress_callback: Optional[Callable[[str], None]] = None
    ) -> dict:
        """
        Envia APK para o bot de crypter e aguarda resposta
        
        Args:
            apk_path: Caminho do APK para enviar
            timeout: Tempo máximo de espera em segundos (padrão: 5 minutos)
            progress_callback: Função para reportar progresso
            
        Returns:
            {"status": "success", "crypted_apk": "caminho/do/apk_cryptado.apk"}
            ou {"status": "error", "message": "..."}
        """
        if not TELETHON_AVAILABLE:
            return {"status": "error", "message": "telethon not installed on server"}

        if not self.is_connected:
            if not await self.connect():
                return {"status": "error", "message": "Não conectado ao Telegram"}
        
        if not os.path.exists(apk_path):
            return {"status": "error", "message": f"APK não encontrado: {apk_path}"}
        
        bot_username = self.config.get("bot_username", "")
        if not bot_username:
            return {"status": "error", "message": "Bot não configurado"}
        
        try:
            if progress_callback:
                progress_callback("Conectando ao bot...")
            
            # Obtém entidade do bot
            bot = await self.client.get_entity(bot_username)
            logger.info(f"📤 Enviando APK para @{bot_username}...")
            
            if progress_callback:
                progress_callback("Enviando APK para o bot...")
            
            # Envia o APK
            await self.client.send_file(
                bot,
                apk_path,
                caption="🔐 Cryptar este APK",
                progress_callback=lambda current, total: (
                    progress_callback(f"Enviando: {current * 100 // total}%") 
                    if progress_callback else None
                )
            )
            
            logger.info("✅ APK enviado, aguardando resposta do bot...")
            if progress_callback:
                progress_callback("APK enviado, aguardando crypter processar...")
            
            # Aguarda resposta do bot com arquivo
            self.crypted_apk_path = None
            received_file = asyncio.Event()
            
            @self.client.on(events.NewMessage(from_users=bot))
            async def handler(event):
                # Verifica se é um arquivo (documento)
                if event.message.document:
                    file_name = event.message.document.attributes[0].file_name if event.message.document.attributes else "crypted.apk"
                    
                    # Se for APK, baixa
                    if file_name.endswith('.apk') or 'apk' in file_name.lower():
                        if progress_callback:
                            progress_callback("Baixando APK criptado...")
                        
                        # Define caminho de saída
                        output_dir = TELEGRAM_DIR / "downloads"
                        output_dir.mkdir(exist_ok=True)
                        output_path = output_dir / f"crypted_{datetime.now().strftime('%Y%m%d_%H%M%S')}.apk"
                        
                        # Baixa o arquivo
                        await self.client.download_media(
                            event.message,
                            file=str(output_path),
                            progress_callback=lambda current, total: (
                                progress_callback(f"Baixando: {current * 100 // total}%")
                                if progress_callback else None
                            )
                        )
                        
                        self.crypted_apk_path = str(output_path)
                        logger.info(f"✅ APK criptado baixado: {self.crypted_apk_path}")
                        received_file.set()
                
                # Mensagem de texto (pode ser erro ou status)
                elif event.message.text:
                    logger.info(f"📩 Mensagem do bot: {event.message.text}")
                    if progress_callback:
                        progress_callback(f"Bot: {event.message.text[:50]}...")
            
            # Aguarda arquivo ou timeout
            try:
                await asyncio.wait_for(received_file.wait(), timeout=timeout)
                self.client.remove_event_handler(handler)
                
                if self.crypted_apk_path:
                    return {
                        "status": "success",
                        "crypted_apk": self.crypted_apk_path,
                        "message": "APK criptado com sucesso!"
                    }
                else:
                    return {"status": "error", "message": "Não recebeu arquivo do bot"}
                    
            except asyncio.TimeoutError:
                self.client.remove_event_handler(handler)
                return {"status": "error", "message": f"Timeout: bot não respondeu em {timeout}s"}
                
        except Exception as e:
            logger.error(f"❌ Erro ao enviar APK: {e}")
            return {"status": "error", "message": str(e)}
    
    def get_status(self) -> dict:
        """Retorna status da integração"""
        return {
            "configured": bool(self.config.get("api_id") and self.config.get("api_hash") and TELETHON_AVAILABLE),
            "phone": self.config.get("phone", ""),
            "bot_username": self.config.get("bot_username", ""),
            "connected": self.is_connected,
            "waiting_code": self.is_waiting_code,
            "waiting_password": self.is_waiting_password,
            "has_session": bool(self.config.get("session_string"))
        }


# Instância global
telegram_crypter = TelegramCrypter()


# ==================== FUNÇÕES AUXILIARES ====================

async def crypt_apk(apk_path: str, progress_callback: Optional[Callable[[str], None]] = None) -> dict:
    """
    Função de alto nível para criptografar APK
    """
    return await telegram_crypter.send_apk_for_crypting(apk_path, progress_callback=progress_callback)


def get_telegram_status() -> dict:
    """Retorna status do Telegram"""
    return telegram_crypter.get_status()

