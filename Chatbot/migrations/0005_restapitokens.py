from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0004_calllog_call_uuid"),
    ]

    operations = [
        migrations.CreateModel(
            name="RESTAPITOKENS",
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
                ("token", models.CharField(max_length=255, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["-id"],
                "verbose_name": "REST API token",
                "verbose_name_plural": "REST API tokens",
            },
        ),
    ]
