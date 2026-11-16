"""Give demo listings real photos instead of drawings.

    python manage.py load_demo_photos

Replaces the generated illustrations (demo-*.jpg) and earlier stock photos (stock-*.jpg) and fills properties that
have no photo at all, using the stock photos in apps/properties/demo_photos/ (see CREDITS.md).
Development only. Photos a provider uploaded are never touched.
"""

from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

from apps.properties.models import Property, PropertyImage

PHOTOS = Path(__file__).resolve().parents[2] / "demo_photos"

HOMES = [
    "a-house-in-residential-area.jpg",
    "a-standard-residential-house-2.jpg",
    "karen-blixen-museum-house.jpg",
    "a-standard-residential-house-3.jpg",
]
FLATS = ["troyeville-block-of-flats.jpg", "a-house-in-residential-area.jpg"]
BOARDING = ["a-standard-residential-house-3.jpg", "hostel-6-bed-dorm-room-kuching-malaysia.jpg", "iitb-hostel-room-in-hostel-1.jpg"]


def photos_for(prop, index):
    if prop.property_type == "boarding_house":
        return BOARDING
    if prop.property_type == "apartment":
        return FLATS if index % 2 else FLATS[::-1]
    # Rotate so neighbouring cards don't all show the same house first.
    return HOMES[index % len(HOMES):] + HOMES[: index % len(HOMES)]


class Command(BaseCommand):
    help = "Replace generated demo illustrations with stock photos (development only)."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            self.stderr.write("load_demo_photos only runs with DEBUG=1.")
            return
        updated = 0
        for index, prop in enumerate(Property.objects.order_by("id")):
            images = list(prop.images.all())
            generated = [img for img in images if Path(img.image.name).name.startswith(("demo-", "stock-"))]
            if images and len(generated) < len(images):
                continue  # has real uploaded photos: leave alone
            for img in generated:
                img.image.delete(save=False)
                img.delete()
            for order, name in enumerate(photos_for(prop, index)[:3]):
                with (PHOTOS / name).open("rb") as fh:
                    PropertyImage.objects.create(property=prop, image=File(fh, name=f"stock-{name}"), order=order)
            updated += 1
        self.stdout.write(self.style.SUCCESS(f"Stock photos added to {updated} properties."))
