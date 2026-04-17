from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0005_restapitokens"),
    ]

    operations = [
        migrations.AlterField(
            model_name="calllog",
            name="call_id",
            field=models.BigIntegerField(
                help_text="Must be a 10-digit integer.",
            ),
        ),
    ]
