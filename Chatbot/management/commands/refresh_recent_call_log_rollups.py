from django.core.management.base import BaseCommand

from Chatbot.maintenance import refresh_rollups_and_invalidate_caches


class Command(BaseCommand):
    help = "Refresh recent minute-level call log rollups from raw call logs."

    def add_arguments(self, parser):
        parser.add_argument(
            "--lookback-minutes",
            type=int,
            default=120,
            help="How many recent minutes to rebuild in the rollup table.",
        )

    def handle(self, *args, **options):
        lookback_minutes = max(1, int(options["lookback_minutes"]))
        summary = refresh_rollups_and_invalidate_caches(
            lookback_minutes=lookback_minutes,
        )

        if summary["skipped"]:
            self.stdout.write(
                self.style.WARNING(
                    "Recent rollup refresh skipped because another maintenance run is already in progress."
                )
            )
            return

        self.stdout.write(
            self.style.SUCCESS(
                "Refreshed recent call log rollups from "
                f"{summary['processed_count']} call log(s) over the last "
                f"{lookback_minutes} minute(s)."
            )
        )
