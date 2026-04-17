import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Client",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="client_profile",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                ("client_name", models.CharField(max_length=255)),
                ("backup_email", models.EmailField(blank=True, max_length=254)),
            ],
            options={"ordering": ["client_name"]},
        ),
        migrations.CreateModel(
            name="Dialer",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("dialer_name", models.CharField(max_length=255)),
                ("project", models.CharField(max_length=255)),
                ("xferexten", models.IntegerField()),
                ("agent_count", models.IntegerField()),
                ("batch", models.IntegerField()),
                (
                    "route_ip",
                    models.TextField(
                        help_text="Store one or more IPs. Separate multiple IPs with commas or new lines."
                    ),
                ),
                ("flow", models.CharField(max_length=255)),
                (
                    "client",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="dialers",
                        to="Chatbot.client",
                    ),
                ),
            ],
            options={"ordering": ["dialer_name"]},
        ),
        migrations.CreateModel(
            name="CallLog",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "call_id",
                    models.BigIntegerField(
                        help_text="Must be a 10-digit integer.",
                        unique=True,
                        validators=[
                            django.core.validators.MinValueValidator(1000000000),
                            django.core.validators.MaxValueValidator(9999999999),
                        ],
                    ),
                ),
                ("status", models.CharField(max_length=255)),
                ("state", models.CharField(max_length=255)),
                ("duration", models.IntegerField()),
                (
                    "dialer",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="call_logs",
                        to="Chatbot.dialer",
                    ),
                ),
            ],
            options={"ordering": ["-id"]},
        ),
        migrations.CreateModel(
            name="BlacklistedNumbers",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                (
                    "number",
                    models.BigIntegerField(
                        help_text="Must be a 10-digit integer.",
                        unique=True,
                        validators=[
                            django.core.validators.MinValueValidator(1000000000),
                            django.core.validators.MaxValueValidator(9999999999),
                        ],
                    ),
                ),
                ("reason", models.CharField(max_length=255)),
            ],
            options={
                "ordering": ["number"],
                "verbose_name_plural": "Blacklisted numbers",
            },
        ),
    ]
