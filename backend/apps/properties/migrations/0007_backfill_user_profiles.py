from django.conf import settings
from django.db import migrations


def backfill_profiles(apps, schema_editor):
    """Give every existing account a profile. Property owners become providers."""
    User = apps.get_model(*settings.AUTH_USER_MODEL.split("."))
    UserProfile = apps.get_model("properties", "UserProfile")
    Property = apps.get_model("properties", "Property")

    owner_ids = set(Property.objects.values_list("owner_id", flat=True))
    existing = set(UserProfile.objects.values_list("user_id", flat=True))

    for user in User.objects.exclude(id__in=existing).only("id"):
        is_provider = user.id in owner_ids
        UserProfile.objects.create(
            user_id=user.id,
            role="provider" if is_provider else "user",
            user_type="" if is_provider else "general_seeker",
            verification_status="pending" if is_provider else "unverified",
        )


class Migration(migrations.Migration):

    dependencies = [
        ("properties", "0006_profiles_boarding_tenancy"),
    ]

    operations = [
        migrations.RunPython(backfill_profiles, migrations.RunPython.noop),
    ]
