"""HAMi control-plane backend.

FastAPI service that owns all Docker / GPU operations. The NiceGUI panel
talks to this service over HTTP + WebSocket — no direct Docker access
from the UI process.
"""

__version__ = "0.3.0"
