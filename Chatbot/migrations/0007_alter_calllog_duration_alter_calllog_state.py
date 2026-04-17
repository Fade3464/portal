from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0006_alter_calllog_call_id"),
    ]

    operations = [
        migrations.AlterField(
            model_name="calllog",
            name="duration",
            field=models.IntegerField(default=0),
        ),
        migrations.AlterField(
            model_name="calllog",
            name="state",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
