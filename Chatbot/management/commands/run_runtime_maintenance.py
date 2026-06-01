from django.core.management.base import BaseCommand

from Chatbot.maintenance import run_runtime_maintenance


class Command(BaseCommand):
    help = (
        "Run the app's periodic maintenance: expire stale LIVE calls, "
        "refresh recent rollups, and invalidate affected dashboard caches."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--lookback-minutes",
            type=int,
            default=60,
            help="How many recent minutes to rebuild in the rollup table.",
        )
        parser.add_argument(
            "--preload-caches",
            action="store_true",
            help="Also preload API token and dialer route caches.",
        )

    def handle(self, *args, **options):
        lookback_minutes = max(1, int(options["lookback_minutes"]))
        summary = run_runtime_maintenance(
            lookback_minutes=lookback_minutes,
            preload_caches=bool(options["preload_caches"]),
        )

        if summary["skipped"]:
            self.stdout.write(
                self.style.WARNING(
                    "Runtime maintenance skipped because another maintenance run is already in progress."
                )
            )
            return

        cache_preload_summary = summary["cache_preload_summary"]
        if cache_preload_summary is not None:
            if not cache_preload_summary["tokens_loaded"]:
                self.stdout.write(
                    self.style.WARNING("API token cache preload skipped or failed.")
                )
            if not cache_preload_summary["routes_loaded"]:
                self.stdout.write(
                    self.style.WARNING("Dialer route cache preload skipped or failed.")
                )

        self.stdout.write(
            self.style.SUCCESS(
                "Runtime maintenance complete: "
                f"expired {summary['expired_live_count']} stale LIVE call(s), "
                f"refreshed rollups from {summary['refreshed_count']} call log(s), "
                f"invalidated {len(summary['affected_client_ids'])} affected client cache scope(s)."
            )
        )
