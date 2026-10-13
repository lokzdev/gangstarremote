# -*- coding: utf-8 -*-
"""
OTIMIZADOR DE PERFORMANCE DO SERVIDOR RAT
Aplica otimizacoes automaticas baseadas no benchmark
"""

import sys
import os
import json

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def print_header(text):
    print(f"\n{'='*60}")
    print(f"  {text}")
    print(f"{'='*60}\n")

def analyze_and_optimize():
    """Analisa e sugere otimizacoes"""
    
    print_header("ANALISE DE PERFORMANCE")
    
    # Verifica recursos do sistema
    try:
        import psutil
        
        cpu_count = psutil.cpu_count()
        mem_total = psutil.virtual_memory().total / 1024 / 1024 / 1024
        mem_available = psutil.virtual_memory().available / 1024 / 1024 / 1024
        
        print(f"  Sistema detectado:")
        print(f"    - CPUs: {cpu_count}")
        print(f"    - RAM Total: {mem_total:.1f} GB")
        print(f"    - RAM Disponivel: {mem_available:.1f} GB")
        
    except ImportError:
        cpu_count = 4
        mem_total = 16
        mem_available = 8
        print("  psutil nao disponivel - usando valores padrao")
    
    print_header("OTIMIZACOES RECOMENDADAS")
    
    optimizations = []
    
    # 1. Workers baseado em CPU
    workers = max(cpu_count * 2, 4)
    optimizations.append(f"NUM_WORKERS={workers}")
    print(f"  1. Workers: {workers} (2x CPUs)")
    
    # 2. Frame TTL baseado em memoria
    if mem_available < 4:
        frame_ttl = 30
    elif mem_available < 8:
        frame_ttl = 60
    else:
        frame_ttl = 120
    optimizations.append(f"FRAME_TTL_SECONDS={frame_ttl}")
    print(f"  2. Frame TTL: {frame_ttl}s (baseado em {mem_available:.1f}GB RAM livre)")
    
    # 3. Hierarchy TTL
    hierarchy_ttl = frame_ttl // 2
    optimizations.append(f"HIERARCHY_TTL_SECONDS={hierarchy_ttl}")
    print(f"  3. Hierarchy TTL: {hierarchy_ttl}s")
    
    # 4. Queue size
    queue_size = 2 if mem_available < 8 else 3
    optimizations.append(f"DASHBOARD_QUEUE_SIZE={queue_size}")
    print(f"  4. Dashboard Queue: {queue_size}")
    
    # 5. Uvicorn settings
    print(f"\n  5. Comando uvicorn otimizado:")
    uvicorn_cmd = f"""
    python -m uvicorn main:app \\
        --host 0.0.0.0 \\
        --port 7771 \\
        --http httptools \\
        --ws websockets \\
        --limit-concurrency 500 \\
        --limit-max-requests 0 \\
        --timeout-keep-alive 60 \\
        --backlog 2048
    """
    print(uvicorn_cmd)
    
    print_header("OTIMIZACOES DE CODIGO")
    
    print("""
  Principais gargalos identificados:
  
  1. POLLING DO FRONTEND (V2)
     Problema: Frontend faz polling a cada 100ms = 10 req/s por cliente
     Solucao: Usar WebSocket para push de hierarquia
     
  2. PERSISTENCIA EM DISCO
     Problema: Escreve frames em disco a cada 10 frames
     Solucao: Manter apenas em memoria, persistir apenas ao desconectar
     
  3. GARBAGE COLLECTION
     Problema: GC padrao do Python pode causar pausas
     Solucao: gc.disable() durante operacoes criticas
     
  4. JSON PARSING
     Problema: json.loads/dumps sao lentos
     Solucao: Usar orjson ou ujson
     
  5. LOGGING
     Problema: Muitos logs = I/O lento
     Solucao: Nivel WARNING em producao
    """)
    
    print_header("APLICANDO OTIMIZACOES")
    
    # Cria arquivo .env otimizado
    env_content = "\n".join(optimizations)
    env_path = os.path.join(os.path.dirname(__file__), ".env.optimized")
    
    with open(env_path, "w") as f:
        f.write(env_content)
    
    print(f"  Arquivo criado: {env_path}")
    print(f"  Conteudo:\n{env_content}")
    
    # Cria script de inicializacao otimizado
    bat_content = f"""@echo off
echo ========================================
echo   SERVIDOR RAT - MODO ULTRA TURBO
echo ========================================
echo.

REM Configuracoes de performance Python
set PYTHONOPTIMIZE=2
set PYTHONDONTWRITEBYTECODE=1
set PYTHONUNBUFFERED=1
set PYTHONASYNCIODEBUG=0

REM Configuracoes do servidor
set FRAME_TTL_SECONDS={frame_ttl}
set HIERARCHY_TTL_SECONDS={hierarchy_ttl}
set DASHBOARD_QUEUE_SIZE={queue_size}

REM Prioridade alta para o processo
start /HIGH python -m uvicorn main:app --host 0.0.0.0 --port 7771 --http httptools --ws websockets --limit-concurrency 500 --timeout-keep-alive 60 --backlog 2048

pause
"""
    
    bat_path = os.path.join(os.path.dirname(__file__), "start_ultra_turbo.bat")
    with open(bat_path, "w") as f:
        f.write(bat_content)
    
    print(f"\n  Script criado: {bat_path}")
    
    return optimizations

if __name__ == "__main__":
    analyze_and_optimize()
    
    print_header("PROXIMOS PASSOS")
    print("""
  1. Pare o servidor atual
  2. Execute: start_ultra_turbo.bat
  3. Execute benchmark.py novamente para comparar
  
  Para otimizacoes adicionais no codigo:
  - Instale: pip install orjson
  - Substitua json por orjson no main.py
  - Reduza logging para WARNING
    """)

