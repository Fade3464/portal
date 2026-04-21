from django.db import migrations, models


def populate_calllog_batch(apps, schema_editor):
    CallLog = apps.get_model("Chatbot", "CallLog")

    logs_to_update = []
    for call_log in CallLog.objects.select_related("dialer").all().iterator(chunk_size=1000):
        call_log.batch = call_log.dialer.batch
        logs_to_update.append(call_log)

        if len(logs_to_update) >= 1000:
            CallLog.objects.bulk_update(logs_to_update, ["batch"], batch_size=1000)
            logs_to_update = []

    if logs_to_update:
        CallLog.objects.bulk_update(logs_to_update, ["batch"], batch_size=1000)


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0016_alter_dialer_dialer_name"),
    ]

    operations = [
        migrations.AddField(
            model_name="calllog",
            name="batch",
            field=models.IntegerField(default=0),
        ),
        migrations.RunPython(populate_calllog_batch, migrations.RunPython.noop),
    ]
