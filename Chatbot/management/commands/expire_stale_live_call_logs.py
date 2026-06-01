from django.core.management.base import BaseCommand

from Chatbot.maintenance import run_runtime_maintenance


class Command(BaseCommand):
    help = "Expire stale LIVE call logs and invalidate affected dashboard caches."

    def handle(self, *args, **options):
        summary = run_runtime_maintenance(lookback_minutes=60)

        self.stdout.write(
            self.style.SUCCESS(
                "Expired "
                f"{summary['expired_live_count']} stale live call logs across "
                f"{len(summary['affected_client_ids'])} client cache scope(s)."
            )
        )
