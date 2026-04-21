from threading import Lock

from django.db.utils import OperationalError, ProgrammingError

from .models import RESTAPITOKENS

_active_tokens = set()
_active_tokens_lock = Lock()


def preload_active_api_tokens():
    try:
        tokens = set(
            RESTAPITOKENS.objects.filter(is_active=True).values_list("token", flat=True)
        )
    except (OperationalError, ProgrammingError):
        return False

    with _active_tokens_lock:
        _active_tokens.clear()
        _active_tokens.update(tokens)

    return True


def get_active_api_tokens():
    with _active_tokens_lock:
        return set(_active_tokens)
