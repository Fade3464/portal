from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0014_alter_dialer_xferexten"),
    ]

    operations = [
        migrations.AddField(
            model_name="dialer",
            name="agent_api_url",
            field=models.URLField(blank=True, max_length=1000, null=True),
        ),
        migrations.AddField(
            model_name="dialer",
            name="non_agent_api_url",
            field=models.URLField(blank=True, max_length=1000, null=True),
        ),
        migrations.AddField(
            model_name="dialer",
            name="api_user",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name="dialer",
            name="api_password",
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
