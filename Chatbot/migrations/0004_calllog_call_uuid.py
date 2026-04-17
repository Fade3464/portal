import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("Chatbot", "0003_calllog_created_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="calllog",
            name="call_uuid",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
