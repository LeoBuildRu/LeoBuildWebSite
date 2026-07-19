from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('application', '0029_savedscene'),
    ]

    operations = [
        migrations.AddField(
            model_name='savedscene',
            name='share_token',
            field=models.UUIDField(blank=True, db_index=True, null=True, unique=True),
        ),
    ]
