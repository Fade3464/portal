from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0010_scale_calllog_and_dialer_indexes"),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="recovery_totp_enabled",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="client",
            name="recovery_totp_secret",
            field=models.CharField(blank=True, max_length=64),
        ),
    ]
