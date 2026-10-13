"""Compat layer: gangstar_env -> hydra_env

Este módulo fornece compatibilidade com scripts/entradas que importam
`gangstar_env`. Implementa `detect_host_ipv4()` para detectar um IP
não-loopback usado pela máquina (técnica de socket UDP) e faz fallback
para um serviço externo quando necessário.
"""
from __future__ import annotations

import os
import socket
from pathlib import Path
from typing import Optional
import urllib.request

# Reutiliza a configuração existente em hydra_env
try:
    from . import hydra_env as _hydra
except Exception:
    # fallback to module import when executed as script
    import hydra_env as _hydra

DEFAULT_IPIFY = "https://api.ipify.org"


def detect_host_ipv4() -> str:
    """Detecta o IPv4 principal da máquina.

    Estratégia:
    1. Tenta abrir um socket UDP para 8.8.8.8 (não envia dados) e ler o endereço local;
       isso retorna o endereço IPv4 usado pela rota padrão (funciona em NAT/VPS).
    2. Se o resultado for loopback ou falhar, tenta consultar um serviço externo (ipify).
    3. Como último recurso, retorna 127.0.0.1.
    """
    # Método rápido via socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # endereço arbitrário do Google DNS, porta 80 (UDP não precisa completar)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        if local_ip and not local_ip.startswith("127."):
            return local_ip
    except Exception:
        pass

    # Fallback: serviço externo
    try:
        with urllib.request.urlopen(os.environ.get('IPIFY_URL', DEFAULT_IPIFY), timeout=5) as resp:
            body = resp.read().decode('utf-8').strip()
            if body and not body.startswith('127.'):
                return body
    except Exception:
        pass

    # Último recurso: hostname resolution
    try:
        hn = socket.gethostname()
        ip = socket.gethostbyname(hn)
        if ip and not ip.startswith('127.'):
            return ip
    except Exception:
        pass

    return '127.0.0.1'


def public_base_url() -> str:
    return _hydra.public_base_url()


def public_ws_url(extra_query: str = "") -> str:
    return _hydra.public_ws_url(extra_query)


def public_http_url() -> str:
    return _hydra.public_http_url()


def database_url() -> str:
    return _hydra.database_url()
