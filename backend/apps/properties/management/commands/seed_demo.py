"""Fill a development database with Lusaka demo data and test accounts.

    python manage.py seed_demo

Test accounts and their generated passwords are written to backend/DEMO_ACCOUNTS.local.md
(git-ignored). Running it again leaves existing demo data alone.
"""

import io
import random
import secrets
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.properties import services
from apps.properties.models import (
    BoardingHouse,
    BoardingRoom,
    BoardingTenancy,
    Listing,
    Property,
    PropertyImage,
    PropertyUnit,
    ProviderApplication,
    UserProfile,
)

ACCOUNTS = [
    # username, first, last, role
    ("nyumba_admin", "Nyumba", "Admin", "admin"),
    ("chanda_homes", "Chanda", "Mulenga", "provider"),
    ("mwansa_rooms", "Mwansa", "Banda", "provider"),
    ("thandiwe", "Thandiwe", "Phiri", "user"),
    ("kondwani", "Kondwani", "Zulu", "user"),
]

HOMES = [
    # title, neighbourhood, lat, lng, kind, price, beds, baths, size, type, furnishing, booking mode
    ("Garden house with borehole", "Kabulonga", -15.4135, 28.3305, "rent", 18500, 4, 3, 320, "house", "unfurnished", "request"),
    ("Modern family home", "Ibex Hill", -15.4421, 28.3480, "sale", 4200000, 4, 3, 450, "house", "semi_furnished", "request"),
    ("Two-bedroom flat near Arcades", "Longacres", -15.4100, 28.3080, "rent", 9500, 2, 1, 110, "apartment", "furnished", "request"),
    ("Woodlands cottage", "Woodlands", -15.4330, 28.3110, "rent", 6500, 1, 1, 70, "cottage", "furnished", "instant"),
    ("Roma townhouse", "Roma", -15.3760, 28.3210, "rent", 14000, 3, 2, 210, "townhouse", "semi_furnished", "request"),
    ("Rhodes Park executive stay", "Rhodes Park", -15.4060, 28.2990, "stay", 1350, 2, 2, 120, "apartment", "furnished", "instant"),
    ("Kalundu weekend studio", "Kalundu", -15.3950, 28.3320, "stay", 750, 1, 1, 45, "apartment", "furnished", "instant"),
    ("Makeni plot with three units", "Makeni", -15.4690, 28.2570, "sale", 1850000, 6, 3, 600, "house", "unfurnished", "request"),
    ("Chelstone starter home", "Chelstone", -15.3640, 28.3740, "rent", 5200, 2, 1, 90, "house", "unfurnished", "request"),
    ("Sunningdale apartment", "Sunningdale", -15.4250, 28.2950, "rent", 7800, 2, 2, 100, "apartment", "semi_furnished", "request"),
    ("Olympia guest suite", "Olympia", -15.3990, 28.3200, "stay", 950, 1, 1, 55, "cottage", "furnished", "request"),
    ("Thorn Park family house", "Thorn Park", -15.4210, 28.2720, "sale", 2300000, 3, 2, 260, "house", "unfurnished", "request"),
    ("Avondale garden flat", "Avondale", -15.3880, 28.3650, "rent", 6800, 2, 1, 95, "apartment", "unfurnished", "instant"),
    ("Northmead city pad", "Northmead", -15.4010, 28.2960, "stay", 1100, 1, 1, 60, "apartment", "furnished", "instant"),
]

AMENITIES = ["Borehole", "Solar backup", "Wi-Fi", "Parking", "Security", "Garden", "DSTV", "Water tank"]

BOARDING = [
    # name, neighbourhood, town, lat, lng, near, gender, booking mode, rooms [(name, type, capacity, price)]
    (
        "Great East Road Student Lodge", "Chudleigh", "Lusaka", -15.3905, 28.3330,
        "University of Zambia (UNZA)", "mixed", "instant",
        [("Room 01", "dorm", 4, 850), ("Room 02", "double", 2, 1100), ("Room 03", "single", 1, 1600), ("Room 04", "triple", 3, 950)],
    ),
    (
        "Kalingalinga Ladies Hostel", "Kalingalinga", "Lusaka", -15.3990, 28.3410,
        "University of Zambia (UNZA)", "female", "request",
        [("Room A", "double", 2, 1000), ("Room B", "double", 2, 1000), ("Room C", "single", 1, 1450)],
    ),
    (
        "Riverside Scholars House", "Riverside", "Kitwe", -12.8130, 28.2290,
        "Copperbelt University (CBU)", "male", "request",
        [("Room 1", "dorm", 4, 700), ("Room 2", "dorm", 4, 700), ("Room 3", "self_contained", 1, 1500)],
    ),
]

PALETTES = [
    ((150, 196, 230), (236, 241, 245), (247, 247, 245), (55, 65, 81), (191, 160, 120)),
    ((246, 190, 140), (250, 228, 205), (240, 236, 230), (40, 48, 64), (120, 140, 110)),
    ((120, 170, 220), (220, 233, 245), (255, 255, 255), (30, 41, 59), (160, 120, 90)),
    ((190, 210, 235), (245, 245, 250), (232, 225, 214), (71, 85, 105), (140, 160, 120)),
    ((250, 200, 170), (253, 236, 220), (250, 250, 250), (17, 24, 39), (190, 140, 100)),
]

OCCUPANT_NAMES = ["Mutale", "Bwalya", "Natasha", "Lubinda", "Chipo", "Musonda"]


def house_image(seed):
    """A simple architectural illustration so demo cards aren't empty."""
    from PIL import Image, ImageDraw

    rnd = random.Random(seed)
    sky_top, sky_bottom, wall, trim, accent = PALETTES[seed % len(PALETTES)]
    w, h = 960, 640
    img = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(sky_top[i] * (1 - t) + sky_bottom[i] * t) for i in range(3)))
    d.rectangle([0, int(h * 0.78), w, h], fill=(108, 152, 92))
    d.rectangle([0, int(h * 0.86), w, h], fill=(196, 196, 190))
    for x in (rnd.randint(30, 160), rnd.randint(800, 920)):
        d.rectangle([x - 6, int(h * 0.62), x + 6, int(h * 0.80)], fill=(92, 70, 50))
        d.ellipse([x - 60, int(h * 0.42), x + 60, int(h * 0.68)], fill=(78, 128, 74))
    left, right = rnd.randint(190, 240), rnd.randint(720, 770)
    top = int(h * rnd.uniform(0.36, 0.44))
    base = int(h * 0.80)
    d.rectangle([left, top, right, base], fill=wall, outline=trim, width=3)
    if rnd.random() < 0.5:
        d.polygon([(left - 30, top), ((left + right) // 2, top - 120), (right + 30, top)], fill=trim)
    else:
        d.rectangle([left - 25, top - 14, right + 25, top + 6], fill=trim)
        bx = rnd.randint(left + 40, left + 200)
        d.rectangle([bx, top - 130, bx + 300, top - 14], fill=wall, outline=trim, width=3)
        d.rectangle([bx + 20, top - 110, bx + 280, top - 40], fill=(170, 200, 225), outline=trim, width=3)
    cols = rnd.randint(3, 5)
    span = (right - left - 60) / cols
    for i in range(cols):
        x0 = int(left + 30 + i * span + 10)
        d.rectangle([x0, top + 40, x0 + int(span) - 30, top + 130], fill=(176, 206, 230), outline=trim, width=3)
    mid = (left + right) // 2
    d.rectangle([mid - 40, base - 150, mid + 40, base], fill=accent, outline=trim, width=3)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=82)
    return ContentFile(buf.getvalue(), name=f"demo-{seed}.jpg")


class Command(BaseCommand):
    help = "Create Lusaka demo data and test accounts for local development."

    def handle(self, *args, **options):
        if not settings.DEBUG:
            self.stderr.write("seed_demo only runs with DEBUG=1.")
            return
        rnd = random.Random(7)
        accounts = {}
        lines = ["# Demo accounts (local development only)", "", "Generated by `python manage.py seed_demo`. Do not commit.", ""]
        with transaction.atomic():
            for username, first, last, role in ACCOUNTS:
                user = User.objects.filter(username=username).first()
                if user is None:
                    password = secrets.token_urlsafe(9)
                    user = User.objects.create_user(
                        username,
                        f"{username}@demo.nyumba.local",
                        password,
                        first_name=first,
                        last_name=last,
                        is_staff=role == "admin",
                    )
                    UserProfile.objects.get_or_create(user=user)
                    lines.append(f"- **{username}** ({role}): `{password}`")
                accounts[username] = user
                if role == "provider" and not hasattr(user, "provider_profile"):
                    application = ProviderApplication.objects.create(
                        user=user,
                        provider_type="boarding_house" if username == "mwansa_rooms" else "landlord",
                        business_name=f"{first} {'Rooms' if username == 'mwansa_rooms' else 'Homes'}",
                        phone_number="+260 977 000 000",
                    )
                    services.approve_provider_application(application, accounts["nyumba_admin"])

            owner = accounts["chanda_homes"]
            if not Property.objects.filter(owner=owner).exists():
                for i, (title, area, lat, lng, kind, price, beds, baths, size, ptype, furn, mode) in enumerate(HOMES):
                    prop = Property.objects.create(
                        owner=owner,
                        title=title,
                        neighbourhood=area,
                        town="Lusaka",
                        address=f"Plot {rnd.randint(10, 9999)}, {area}, Lusaka",
                        latitude=lat,
                        longitude=lng,
                        bedrooms=beds,
                        bathrooms=baths,
                        size_sqm=size,
                        property_type=ptype,
                        furnishing=furn,
                        amenities=rnd.sample(AMENITIES, 4),
                        description=f"{title} in {area}. Close to shops and transport, with reliable water.",
                        owner_verified=i % 3 != 2,
                        property_verified=i % 2 == 0,
                    )
                    for j in range(2):
                        PropertyImage.objects.create(property=prop, image=house_image(i * 2 + j), order=j)
                    Listing.objects.create(
                        property=prop, kind=kind, price=Decimal(price), status="approved", booking_mode=mode
                    )
                    if ptype == "apartment" and kind == "rent":
                        for u in range(1, 4):
                            PropertyUnit.objects.create(
                                property=prop,
                                name=f"Flat {u}",
                                bedrooms=beds,
                                bathrooms=baths,
                                monthly_rent=Decimal(price),
                                status="occupied" if u < 3 else "available",
                                tenant_name="" if u == 3 else rnd.choice(["J. Tembo", "M. Lungu", "C. Mwale"]),
                            )

            manager = accounts["mwansa_rooms"]
            if not BoardingHouse.objects.filter(property__owner=manager).exists():
                for i, (name, area, town, lat, lng, near, gender, mode, rooms) in enumerate(BOARDING):
                    prop = Property.objects.create(
                        owner=manager,
                        title=name,
                        neighbourhood=area,
                        town=town,
                        address=f"{rnd.randint(1, 400)} {area} Road, {town}",
                        latitude=lat,
                        longitude=lng,
                        property_type="boarding_house",
                        bedrooms=len(rooms),
                        bathrooms=2,
                        amenities=["Wi-Fi", "Study room", "Security", "Water tank"],
                        owner_verified=True,
                        property_verified=True,
                    )
                    for j in range(2):
                        PropertyImage.objects.create(property=prop, image=house_image(40 + i * 2 + j), order=j)
                    house = BoardingHouse.objects.create(
                        property=prop,
                        name=name,
                        near_institution=near,
                        gender_policy=gender,
                        booking_mode=mode,
                        is_approved=True,
                        amenities=["Wi-Fi", "Study room", "Security", "Laundry"],
                        description=f"Student accommodation a short walk from {near}.",
                        rules="Quiet hours 22:00 to 06:00. Visitors leave by 20:00.",
                    )
                    for room_name, rtype, cap, price in rooms:
                        room = BoardingRoom.objects.create(
                            boarding_house=house,
                            name=room_name,
                            room_type=rtype,
                            capacity=cap,
                            price_per_bed=Decimal(price),
                        )
                        for k in range(cap - 1 if cap > 1 else 0):
                            BoardingTenancy.objects.create(
                                room=room,
                                occupant_name=f"{rnd.choice(OCCUPANT_NAMES)} {k + 1}",
                                occupant_phone="+260 96 000 0000",
                                institution=near.split(" (")[0],
                                status="active",
                                check_in_date=timezone.localdate() - timedelta(days=rnd.randint(10, 90)),
                                rent_amount=Decimal(price) * 4,
                                amount_paid=Decimal(price) * rnd.choice([2, 3, 4]),
                                payment_status="partial",
                            )

        if len(lines) > 4:
            path = Path(settings.BASE_DIR) / "DEMO_ACCOUNTS.local.md"
            with path.open("a", encoding="utf-8") as fh:
                fh.write("\n".join(lines) + "\n")
            self.stdout.write(self.style.SUCCESS(f"Demo accounts written to {path.name}"))
        self.stdout.write(self.style.SUCCESS("Demo data ready."))
