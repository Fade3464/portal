from django.core.management.base import BaseCommand

from Chatbot.maintenance import rebuild_rollups_and_invalidate_caches


class Command(BaseCommand):
    help = "Rebuild minute-level call log rollups from raw call logs."

    def handle(self, *args, **options):
        summary = rebuild_rollups_and_invalidate_caches()

        if summary["skipped"]:
            self.stdout.write(
                self.style.WARNING(
                    "Full rollup rebuild skipped because another maintenance run is already in progress."
                )
            )
            return

        self.stdout.write(
            self.style.SUCCESS(
                f"Rebuilt call log rollups from {summary['processed_count']} call logs."
            )
        )
