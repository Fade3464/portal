from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0015_dialer_api_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="dialer",
            name="dialer_name",
            field=models.CharField(db_index=True, max_length=255),
        ),
    ]
