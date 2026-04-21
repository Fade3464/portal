from django.apps import AppConfig


class ChatbotConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "Chatbot"

    def ready(self):
        from .api_token_cache import preload_active_api_tokens
        from .route_cache import preload_dialer_route_map

        preload_active_api_tokens()
        preload_dialer_route_map()
