from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0018_dialer_batch_cursor_calllog_flow"),
    ]

    operations = [
        migrations.CreateModel(
            name="CallLogMinuteRollup",
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
                ("bucket_start", models.DateTimeField()),
                ("status", models.CharField(db_index=True, max_length=255)),
                ("flow", models.CharField(blank=True, default="", max_length=255)),
                ("batch", models.IntegerField(default=0)),
                ("call_count", models.PositiveIntegerField(default=0)),
                ("total_duration", models.BigIntegerField(default=0)),
                (
                    "client",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="call_log_minute_rollups",
                        to="Chatbot.client",
                    ),
                ),
                (
                    "dialer",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="call_log_minute_rollups",
                        to="Chatbot.dialer",
                    ),
                ),
            ],
            options={
                "ordering": ["-bucket_start", "dialer_id", "status", "flow", "batch"],
            },
        ),
        migrations.AddConstraint(
            model_name="calllogminuterollup",
            constraint=models.UniqueConstraint(
                fields=("client", "dialer", "bucket_start", "status", "flow", "batch"),
                name="cl_minute_rollup_unique",
            ),
        ),
        migrations.AddIndex(
            model_name="calllogminuterollup",
            index=models.Index(
                fields=["client", "bucket_start"],
                name="clmr_client_bucket_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="calllogminuterollup",
            index=models.Index(
                fields=["client", "dialer", "bucket_start"],
                name="clmr_client_dialer_bucket_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="calllogminuterollup",
            index=models.Index(
                fields=["client", "status", "bucket_start"],
                name="clmr_client_status_bucket_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="calllogminuterollup",
            index=models.Index(
                fields=["client", "flow", "batch", "bucket_start"],
                name="clmr_cli_flow_batch_idx",
            ),
        ),
    ]
