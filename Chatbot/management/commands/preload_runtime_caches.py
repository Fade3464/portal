from django.core.management.base import BaseCommand

from Chatbot.maintenance import preload_runtime_caches


class Command(BaseCommand):
    help = "Preload DB-backed runtime caches such as API tokens and dialer route map."

    def handle(self, *args, **options):
        summary = preload_runtime_caches()

        if not summary["tokens_loaded"]:
            self.stdout.write(
                self.style.WARNING("API token cache preload skipped or failed.")
            )
        if not summary["routes_loaded"]:
            self.stdout.write(
                self.style.WARNING("Dialer route cache preload skipped or failed.")
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Preloaded runtime caches: {summary['token_count']} active API token(s), "
                f"{summary['route_count']} dialer route entrie(s)."
            )
        )
