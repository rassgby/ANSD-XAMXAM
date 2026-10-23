import sys
from pathlib import Path

# Les modules du backend (api, voice, agent…) s'importent depuis la racine de backend/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
