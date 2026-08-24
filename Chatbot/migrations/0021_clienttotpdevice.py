import django.db.models.deletion
from django.db import migrations, models


def migrate_existing_totp_devices(apps, schema_editor):
    Client = apps.get_model("Chatbot", "Client")
    ClientTOTPDevice = apps.get_model("Chatbot", "ClientTOTPDevice")

    devices = [
        ClientTOTPDevice(
            client_id=client.id,
            name="Primary authenticator",
            secret=client.recovery_totp_secret,
            enabled=True,
        )
        for client in Client.objects.filter(
            recovery_totp_enabled=True,
        ).exclude(recovery_totp_secret="")
    ]
    ClientTOTPDevice.objects.bulk_create(devices, ignore_conflicts=True)


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0020_add_weighted_routing_hierarchy"),
    ]

    operations = [
        migrations.CreateModel(
            name="ClientTOTPDevice",
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
                ("name", models.CharField(max_length=100)),
                ("secret", models.CharField(max_length=64)),
                ("enabled", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_used_at", models.DateTimeField(blank=True, null=True)),
                (
                    "client",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="authenticator_devices",
                        to="Chatbot.client",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at", "id"],
                "constraints": [
                    models.UniqueConstraint(
                        fields=("client", "name"),
                        name="client_totp_device_name_unique",
                    ),
                ],
            },
        ),
        migrations.RunPython(
            migrate_existing_totp_devices,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
