import os
from pathlib import Path
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.getenv("DEBUG", "0") == "1"
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,testserver").split(",")
INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "rest_framework",
    "meetings",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.common.CommonMiddleware",
]
DATABASES = {
    "default": dj_database_url.config(default="sqlite:///db.sqlite3", conn_max_age=60)
}
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
APPEND_SLASH = False
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 0
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
WHITENOISE_ROOT = BASE_DIR / "web"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_CONTENT_TYPE_NOSNIFF = True
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["meetings.auth.BearerAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_THROTTLE_RATES": {"login": "10/min"},
}
MEDIA_ROOT = Path(os.getenv("MEDIA_ROOT", str(BASE_DIR / "media")))
S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "https://storage.tarka.rest")
S3_REGION = os.getenv("S3_REGION", "eu-1")
KURA_BOT_TOKEN = os.getenv("KURA_BOT_TOKEN", "")
TARKA_BASE_URL = os.getenv("TARKA_BASE_URL", "http://tarka/v1").rstrip("/")
TARKA_API_KEY = os.getenv("TARKA_API_KEY", "")
TARKA_STT_MODEL = os.getenv("TARKA_STT_MODEL", "whisper-large-v3")
TARKA_SUMMARY_MODEL = os.getenv("TARKA_SUMMARY_MODEL", "qwen3.8-flash-next")
MAX_RECORDING_BYTES = 512 * 1024 * 1024
MAX_CHUNKS = 1000
