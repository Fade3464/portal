from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0008_alter_calllog_call_id"),
    ]

    operations = [
        migrations.AddField(
            model_name="calllog",
            name="call_recording_link",
            field=models.URLField(blank=True, max_length=1000, null=True),
        ),
    ]
