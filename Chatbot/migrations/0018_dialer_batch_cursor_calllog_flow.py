from django.db import migrations, models


def populate_calllog_flow(apps, schema_editor):
    CallLog = apps.get_model("Chatbot", "CallLog")

    logs_to_update = []
    for call_log in CallLog.objects.select_related("dialer").all().iterator(chunk_size=1000):
        call_log.flow = call_log.dialer.flow or ""
        logs_to_update.append(call_log)

        if len(logs_to_update) >= 1000:
            CallLog.objects.bulk_update(logs_to_update, ["flow"], batch_size=1000)
            logs_to_update = []

    if logs_to_update:
        CallLog.objects.bulk_update(logs_to_update, ["flow"], batch_size=1000)


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0017_calllog_batch"),
    ]

    operations = [
        migrations.AlterField(
            model_name="dialer",
            name="batch",
            field=models.CharField(max_length=255),
        ),
        migrations.AddField(
            model_name="dialer",
            name="batch_cursor",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="calllog",
            name="flow",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.RunPython(populate_calllog_flow, migrations.RunPython.noop),
    ]
