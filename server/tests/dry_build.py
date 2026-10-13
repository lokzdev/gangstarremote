import sys
import tempfile, os, shutil
from pathlib import Path

# Ensure server root is on sys.path so local imports resolve when running from tests/
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from apk_builder import APKBuilder

# Dry-run build: monkeypatch _compile_apk to avoid invoking Gradle
class DryAPKBuilder(APKBuilder):
    def _compile_apk(self):
        # Simulate compilation by creating a fake APK file in build_dir
        apk_path = self.build_dir / "app" / "build" / "outputs" / "apk" / "release" / "app-release.apk"
        apk_path.parent.mkdir(parents=True, exist_ok=True)
        with open(apk_path, 'wb') as f:
            f.write(b'PK\x03\x04')
        print(f"[DRY-COMPILE] Simulated APK at: {apk_path}")
        return apk_path

if __name__ == '__main__':
    print('Dry-run APK build starting')
    # Localiza android-rat subindo a arvore até 4 niveis
    p = Path(__file__).resolve().parent
    project_dir = None
    for _ in range(5):
        candidate = p / 'android-rat'
        if candidate.exists():
            project_dir = str(candidate)
            break
        if p.parent == p:
            break
        p = p.parent
    if not project_dir:
        # Fallback: assume repo layout at ../../android-rat
        project_dir = os.path.abspath(os.path.join(str(Path(__file__).resolve().parent.parent), 'android-rat'))
    tmp = tempfile.mkdtemp()
    try:
        builder = DryAPKBuilder(project_dir, 'ws://localhost:7771/ws')
        builder.build_custom_apk('Test Dry App', None, os.path.join(tmp, 'test-app.apk'))
        print('Dry-run finished')
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
