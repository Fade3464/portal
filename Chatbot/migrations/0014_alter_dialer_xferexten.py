from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0013_loginratelimit"),
    ]

    operations = [
        migrations.AlterField(
            model_name="dialer",
            name="xferexten",
            field=models.CharField(max_length=64),
        ),
    ]
