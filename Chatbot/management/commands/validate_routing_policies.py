from django.core.management.base import BaseCommand, CommandError

from Chatbot.models import DialerRoutingPolicy


class Command(BaseCommand):
    help = "Validate weighted routing policies without changing routing data."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dialer",
            help="Validate only the policy for this exact dialer name.",
        )
        parser.add_argument(
            "--include-disabled",
            action="store_true",
            help="Also validate draft policies that are not enabled yet.",
        )

    def handle(self, *args, **options):
        policies = DialerRoutingPolicy.objects.select_related("dialer", "project")
        if not options["include_disabled"]:
            policies = policies.filter(enabled=True)
        if options["dialer"]:
            policies = policies.filter(dialer__dialer_name=options["dialer"])

        policies = list(policies.order_by("dialer__dialer_name"))
        if not policies:
            self.stdout.write(self.style.WARNING("No matching routing policies found."))
            return

        invalid_count = 0
        for policy in policies:
            errors = policy.get_configuration_errors()
            active_endpoint_count = policy.endpoints.filter(
                active=True,
                weight__gt=0,
            ).exclude(route_ip="").count()

            if errors:
                invalid_count += 1
                self.stderr.write(
                    self.style.ERROR(
                        f"INVALID {policy.dialer.dialer_name}: {' '.join(errors)}"
                    )
                )
                continue

            route_status = (
                f"{active_endpoint_count} weighted route(s)"
                if active_endpoint_count
                else "legacy route fallback (no active weighted routes)"
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"VALID {policy.dialer.dialer_name}: "
                    f"project={policy.project.name}; {route_status}"
                )
            )

        if invalid_count:
            raise CommandError(f"{invalid_count} routing policy/policies are invalid.")
