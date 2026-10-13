# 🔴 Android RAT - Projeto Educacional

⚠️ **AVISO LEGAL IMPORTANTE** ⚠️

Este projeto foi desenvolvido **EXCLUSIVAMENTE PARA FINS EDUCACIONAIS** e pesquisa em segurança cibernética.

**O uso deste código para fins maliciosos é ILEGAL e pode resultar em:**
- Processos criminais
- Prisão
- Multas pesadas
- Danos à reputação profissional

**USE APENAS EM AMBIENTES CONTROLADOS E COM AUTORIZAÇÃO EXPLÍCITA!**

---

## 📋 Visão Geral do Projeto

Este é um projeto educacional completo de um Android Remote Access Trojan (RAT) que demonstra técnicas avançadas usadas por malware real. O objetivo é ajudar pesquisadores de segurança, analistas de malware e desenvolvedores Android a entender como essas ameaças funcionam para melhor detectá-las e preveni-las.

### Componentes do Projeto

1. **App Android** - RAT completo com:
   - Tela falsa de configurações de acessibilidade
   - Serviço de acessibilidade automatizado
   - Captura de tela em tempo real (VNC)
   - Overlay de tela preta
   - Persistência após reboot
   - Comunicação C&C via WebSocket

2. **Servidor C&C** - Backend em Python com:
   - API FastAPI
   - Banco de dados PostgreSQL
   - WebSocket para comunicação em tempo real
   - Sistema de autenticação JWT

3. **Painel Web** - Interface moderna com:
   - Login/Cadastro de operadores
   - Visualização de dispositivos conectados
   - Controle remoto com VNC em formato de celular
   - Envio de comandos
   - Logs de atividades

---

## 🚀 Como Configurar

### Pré-requisitos

**Para o Servidor:**
- Python 3.9+
- PostgreSQL 13+
- pip (gerenciador de pacotes Python)

**Para o App Android:**
- Android Studio Arctic Fox ou superior
- JDK 11+
- SDK Android 24+ (Android 7.0+)

### Passo 1: Configurar Banco de Dados PostgreSQL

```bash
# No Windows, abra pgAdmin ou psql e execute:
psql -U postgres

# Depois execute os comandos do arquivo init_db.sql:
CREATE USER rat_user WITH PASSWORD 'rat_password';
CREATE DATABASE rat_db OWNER rat_user;
GRANT ALL PRIVILEGES ON DATABASE rat_db TO rat_user;
```

### Passo 2: Configurar e Iniciar o Servidor

```bash
cd server

# Instalar dependências
pip install -r requirements.txt

# Configurar variável de ambiente (opcional)
# set DATABASE_URL=postgresql://rat_user:rat_password@localhost:5432/rat_db

# Iniciar servidor
python main.py
```

O servidor estará rodando em:
- API: http://localhost:4444
- WebSocket: ws://localhost:4444/ws
- Painel Web: http://localhost:4444/web/index.html

### Passo 3: Configurar o App Android

1. Abra o projeto `android-rat` no Android Studio

2. Edite `CommandControlService.java` e altere a URL do servidor:
```java
private static final String SERVER_URL = "ws://SEU_IP:4444/ws";
```

3. Compile o APK:
   - Build > Build Bundle(s) / APK(s) > Build APK(s)

4. O APK estará em: `android-rat/app/build/outputs/apk/debug/app-debug.apk`

### Passo 4: Instalar e Testar

⚠️ **TESTE APENAS EM DISPOSITIVO PRÓPRIO OU EMULADOR!**

```bash
# Conecte seu dispositivo via USB com depuração ativada
adb install app-debug.apk

# Ou use o emulador do Android Studio
```

---

## 🎯 Como Funciona

### Fluxo de Ataque

1. **Instalação**: Vítima instala o app pensando ser um app de segurança

2. **Tela Falsa**: Ao abrir, mostra uma interface FALSA de configurações de acessibilidade

3. **Ativação Enganosa**: Usuário ativa o "serviço de proteção" na tela falsa

4. **Automação**: Por trás dos panos, o serviço de acessibilidade REAL é ativado

5. **Automação de Permissões**: O AccessibilityService automatiza:
   - Permissão de desenhar sobre apps (overlay)
   - Permissão de captura de tela (MediaProjection)
   - Ignorar otimizações de bateria

6. **Conexão C&C**: App conecta ao servidor e envia informações do dispositivo

7. **Controle Total**: Operador pode:
   - Ver tela em tempo real (VNC)
   - Ativar tela preta (vítima vê preto, operador vê tudo)
   - Clicar e digitar remotamente
   - Capturar SMS, contatos, localização
   - E muito mais...

### Técnicas Avançadas Demonstradas

#### 1. Tela Falsa de Acessibilidade
- **O que é**: Uma Activity que imita perfeitamente as configurações do Android
- **Por que funciona**: Usuário pensa estar nas configurações reais
- **Como detectar**: Verificar se a Activity pertence ao pacote `com.android.settings`

#### 2. Automação via AccessibilityService
- **O que é**: Serviço que "vê" e "clica" em elementos da UI
- **Por que é poderoso**: Pode automatizar QUALQUER interação
- **Como detectar**: Monitorar serviços de acessibilidade ativos

#### 3. Overlay de Tela Preta + MediaProjection
- **O que é**: Mostra tela preta para vítima, mas captura real da tela
- **Por que funciona**: MediaProjection captura camadas abaixo do overlay
- **Como detectar**: Verificar permissões ativas e serviços foreground

#### 4. Persistência
- **O que é**: Reinicia automaticamente após reboot
- **Como funciona**: BroadcastReceiver escuta BOOT_COMPLETED
- **Como detectar**: Verificar receivers registrados

---

## 🔧 Funcionalidades do Painel Web

### Login/Cadastro
- Sistema de autenticação com JWT
- Senhas criptografadas com bcrypt

### Dashboard
- Lista de dispositivos conectados
- Status online/offline em tempo real
- Informações do dispositivo (modelo, Android, etc.)

### Controle Remoto
- **VNC em formato de celular**: Visualização realista da tela
- **Tela preta**: Liga/desliga overlay preto
- **Gestos**: Clique, swipe, scroll
- **Texto**: Digite remotamente
- **Exfiltração**: SMS, contatos, localização

### Logs
- Histórico de comandos enviados
- Dados capturados
- Timeline de atividades

---

## 🛡️ Como se Proteger

### Para Usuários
1. **Nunca instale apps de fontes desconhecidas**
2. **Verifique permissões antes de instalar**
3. **Desconfie de apps que pedem acessibilidade**
4. **Use antivírus confiável**
5. **Mantenha Android atualizado**

### Para Desenvolvedores
1. **Implemente verificação de integridade**
2. **Use SafetyNet Attestation API**
3. **Detecte serviços de acessibilidade suspeitos**
4. **Monitore permissões de overlay**
5. **Implemente certificate pinning**

### Para Pesquisadores de Segurança

#### Indicadores de Comprometimento (IoC)

1. **Permissões Suspeitas**:
   - BIND_ACCESSIBILITY_SERVICE + SYSTEM_ALERT_WINDOW + FOREGROUND_SERVICE_MEDIA_PROJECTION
   - REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
   - RECEIVE_BOOT_COMPLETED

2. **Comportamento Anômalo**:
   - App "de segurança" que pede acessibilidade
   - Tela falsa que imita Settings
   - Serviço foreground rodando continuamente
   - Tráfego de rede constante

3. **Análise Estática**:
   - Classes: `FakeAccessibilityActivity`, `AutomatedAccessibilityService`
   - Strings: "FAKE", "ACCESSIBILITY", "SCREEN_CAPTURE"
   - Conexões WebSocket suspeitas

4. **Análise Dinâmica**:
   - Monitor de acessibilidade ativado
   - Overlay permanente
   - Tráfego binário (frames JPEG)

---

## 📚 Estrutura do Código

### Android (`android-rat/`)
```
app/src/main/
├── java/com/seguranca/protecao/
│   ├── MainActivity.java                      # Activity principal
│   ├── FakeAccessibilityActivity.java         # Tela falsa (CRÍTICO)
│   ├── FakeServiceDetailActivity.java         # Detalhes falsos
│   ├── AutomatedAccessibilityService.java     # Automação (CRÍTICO)
│   ├── ScreenCaptureService.java              # Captura de tela
│   ├── OverlayService.java                    # Tela preta
│   ├── CommandControlService.java             # Comunicação C&C
│   ├── PermissionManager.java                 # Gerenciador de permissões
│   └── BootReceiver.java                      # Persistência
├── res/
│   ├── layout/                                # Layouts XML
│   ├── values/                                # Strings, cores
│   └── xml/accessibility_service_config.xml   # Config do serviço
└── AndroidManifest.xml                        # Manifesto
```

### Servidor (`server/`)
```
server/
├── main.py              # Servidor FastAPI principal
├── database.py          # Configuração do banco
├── models.py            # Models SQLAlchemy
├── auth.py              # Autenticação JWT
├── schemas.py           # Schemas Pydantic
├── requirements.txt     # Dependências Python
├── init_db.sql          # Script de inicialização do BD
└── web/                 # Painel web
    ├── index.html       # HTML do painel
    ├── styles.css       # Estilos
    └── app.js           # JavaScript
```

---

## 🔬 Para Pesquisa e Aprendizado

### Tópicos Abordados

1. **Engenharia Social**
   - Design de interfaces falsas
   - Imitação de apps legítimos

2. **Bypassing de Segurança**
   - Automação de permissões
   - Evasão de proteções do Android

3. **Command & Control**
   - WebSocket para comunicação
   - Protocolo binário para frames

4. **Persistência**
   - Boot receivers
   - Foreground services

5. **Exfiltração de Dados**
   - Captura de tela
   - Leitura de SMS/Contatos
   - Localização GPS

---

## ⚖️ Aspectos Legais

### Uso Permitido
✅ Pesquisa em segurança
✅ Educação em cibersegurança
✅ Desenvolvimento de antivírus
✅ Testes em dispositivos próprios
✅ Ambientes controlados de laboratório

### Uso PROIBIDO
❌ Instalação em dispositivos de terceiros sem consentimento
❌ Espionagem ou vigilância ilegal
❌ Roubo de dados
❌ Qualquer atividade criminosa
❌ Distribuição como malware real

---

## 📖 Referências e Recursos

### Documentação Android
- [Accessibility Services](https://developer.android.com/guide/topics/ui/accessibility/service)
- [MediaProjection API](https://developer.android.com/reference/android/media/projection/MediaProjection)
- [System Overlay](https://developer.android.com/reference/android/Manifest.permission#SYSTEM_ALERT_WINDOW)

### Segurança
- [OWASP Mobile Security](https://owasp.org/www-project-mobile-security/)
- [Android Security](https://source.android.com/security)

### Detecção
- [VirusTotal](https://www.virustotal.com/)
- [Hybrid Analysis](https://www.hybrid-analysis.com/)

---

## 🤝 Contribuições

Este projeto é apenas educacional. Se você encontrar bugs ou tiver sugestões:
- Abra uma issue
- Sugira melhorias
- Compartilhe conhecimento

**Lembre-se: Use para o bem, nunca para o mal!**

---

## 📝 Licença

Este projeto é fornecido "como está" apenas para fins educacionais.

**O autor NÃO se responsabiliza por uso indevido deste código.**

---

## 👨‍💻 Desenvolvido para Educação

Criado para demonstrar técnicas de malware moderno e ajudar na defesa contra essas ameaças.

**Se você é um pesquisador de segurança, analista de malware ou desenvolvedor Android, use este conhecimento para tornar o ecossistema mais seguro!**

🛡️ **Segurança primeiro!**
