
import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

env_path = BASE_DIR / ".env"
if env_path.exists():
    load_dotenv(env_path)


def _get_bool_env(name, default=False):
    return os.getenv(name, str(default)).strip().lower() == "true"


def _get_list_env(name, default=""):
    raw_value = os.getenv(name, default)
    return [item.strip() for item in raw_value.split(",") if item.strip()]


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/4.2/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv("SECRET_KEY", "django-insecure-replace-me")
# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = _get_bool_env("DEBUG", False)

ALLOWED_HOSTS = _get_list_env("ALLOWED_HOSTS")
PROD = _get_bool_env("PROD", False)

if PROD and SECRET_KEY == "django-insecure-replace-me":
    raise ImproperlyConfigured("SECRET_KEY must be set in production.")

if PROD and not ALLOWED_HOSTS:
    raise ImproperlyConfigured("ALLOWED_HOSTS must be configured in production.")
# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    "corsheaders",
    "Chatbot",
]
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]



ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "core" / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
WSGI_APPLICATION = 'core.wsgi.application'

REST_FRAMEWORK = {
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
}
# Database
# https://docs.djangoproject.com/en/4.2/ref/settings/#databases

DB_ENGINE = os.getenv("DB_ENGINE", "django.db.backends.sqlite3")
DB_NAME = os.getenv("DB_NAME", BASE_DIR / "db.sqlite3")
DB_USER = os.getenv("DB_USER", "")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_HOST = os.getenv("DB_HOST", "")
DB_PORT = os.getenv("DB_PORT", "")
DB_CONN_MAX_AGE = int(os.getenv("DB_CONN_MAX_AGE", "60"))
CACHE_BACKEND = os.getenv(
    "CACHE_BACKEND",
    "django.core.cache.backends.filebased.FileBasedCache",
)
CACHE_LOCATION = os.getenv("CACHE_LOCATION", str(BASE_DIR / ".django_cache"))

DATABASES = {
    'default': {
        'ENGINE': DB_ENGINE,
        'NAME': DB_NAME,
        'USER': DB_USER,
        'PASSWORD': DB_PASSWORD,
        'HOST': DB_HOST,
        'PORT': DB_PORT,
        'CONN_MAX_AGE': DB_CONN_MAX_AGE,
    }
}

CACHES = {
    "default": {
        "BACKEND": CACHE_BACKEND,
        "LOCATION": CACHE_LOCATION,
        "TIMEOUT": int(os.getenv("CACHE_TIMEOUT", "300")),
        "OPTIONS": {
            "MAX_ENTRIES": int(os.getenv("CACHE_MAX_ENTRIES", "5000")),
        },
    }
}


# Password validation
# https://docs.djangoproject.com/en/4.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/4.2/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'America/New_York'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/4.2/howto/static-files/

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles" 
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
CALL_RECORDINGS_BASE_URL = os.getenv("CALL_RECORDINGS_BASE_URL", "").strip().rstrip("/")
CALL_RECORDINGS_FILE_EXTENSION = (
    os.getenv("CALL_RECORDINGS_FILE_EXTENSION", "wav").strip().lstrip(".") or "wav"
)


# Default primary key field type
# https://docs.djangoproject.com/en/4.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
CORS_ALLOWED_ORIGINS = _get_list_env(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
)
CSRF_TRUSTED_ORIGINS = _get_list_env(
    "CSRF_TRUSTED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173",
)
CORS_ALLOW_CREDENTIALS = True

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = PROD
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = PROD
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = False
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"

USE_X_FORWARDED_HOST = PROD
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https") if PROD else None
SECURE_SSL_REDIRECT = PROD and _get_bool_env("SECURE_SSL_REDIRECT", True)
SECURE_HSTS_SECONDS = int(os.getenv("SECURE_HSTS_SECONDS", "31536000")) if PROD else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = PROD and _get_bool_env(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    True,
)
SECURE_HSTS_PRELOAD = PROD and _get_bool_env("SECURE_HSTS_PRELOAD", True)
