from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0012_remove_client_backup_email"),
    ]

    operations = [
        migrations.CreateModel(
            name="LoginRateLimit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ip_address", models.GenericIPAddressField(unique=True)),
                ("failed_attempts", models.PositiveSmallIntegerField(default=0)),
                ("last_failed_at", models.DateTimeField(blank=True, null=True)),
                ("locked_until", models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "verbose_name": "Login rate limit",
                "verbose_name_plural": "Login rate limits",
                "ordering": ["ip_address"],
            },
        ),
    ]
