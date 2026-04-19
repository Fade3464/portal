import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0009_calllog_call_recording_link"),
    ]

    operations = [
        migrations.AlterField(
            model_name="calllog",
            name="call_id",
            field=models.BigIntegerField(
                db_index=True,
                help_text="Must be a 10-digit integer.",
                validators=[
                    django.core.validators.MinValueValidator(1_000_000_000),
                    django.core.validators.MaxValueValidator(9_999_999_999),
                ],
            ),
        ),
        migrations.AlterField(
            model_name="calllog",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True, db_index=True),
        ),
        migrations.AlterField(
            model_name="calllog",
            name="status",
            field=models.CharField(db_index=True, max_length=255),
        ),
        migrations.AddIndex(
            model_name="dialer",
            index=models.Index(
                fields=["client", "active", "dialer_name"],
                name="dialer_client_active_name_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="dialer",
            index=models.Index(
                fields=["client", "active", "id"],
                name="dialer_client_active_id_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="calllog",
            index=models.Index(
                fields=["dialer", "-created_at", "-id"],
                name="cl_dialer_created_id_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="calllog",
            index=models.Index(
                fields=["dialer", "status", "-created_at", "-id"],
                name="cl_dialer_status_created_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="calllog",
            index=models.Index(
                fields=["-created_at", "-id"],
                name="cl_created_id_idx",
            ),
        ),
    ]
