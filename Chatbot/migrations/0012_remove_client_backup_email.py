from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0011_client_recovery_totp"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="client",
            name="backup_email",
        ),
    ]
