import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create the environment-configured bootstrap superuser when absent."

    def handle(self, *args, **options):
        username = os.getenv("DJANGO_SUPERUSER_USERNAME", "").strip()
        password = os.getenv("DJANGO_SUPERUSER_PASSWORD", "")
        email = os.getenv("DJANGO_SUPERUSER_EMAIL", "").strip()

        if not username and not password:
            self.stdout.write(
                self.style.WARNING(
                    "Superuser bootstrap skipped because credentials are not configured."
                )
            )
            return

        if not username or not password:
            raise CommandError(
                "DJANGO_SUPERUSER_USERNAME and DJANGO_SUPERUSER_PASSWORD "
                "must both be configured."
            )

        User = get_user_model()
        lookup = {User.USERNAME_FIELD: username}
        existing_user = User.objects.filter(**lookup).first()

        if existing_user is not None:
            if not existing_user.is_superuser or not existing_user.is_staff:
                raise CommandError(
                    f"User '{username}' already exists but is not a superuser. "
                    "Resolve this account manually; privileges were not changed."
                )

            self.stdout.write(
                self.style.SUCCESS(
                    f"Bootstrap superuser '{username}' already exists; left unchanged."
                )
            )
            return

        User.objects.create_superuser(
            username=username,
            email=email,
            password=password,
        )
        self.stdout.write(
            self.style.SUCCESS(f"Created bootstrap superuser '{username}'.")
        )
