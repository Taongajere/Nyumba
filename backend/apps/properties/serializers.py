from decimal import Decimal

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Avg, Count
from rest_framework import serializers

from .models import (
    BOOKING_MODES,
    BoardingHouse,
    BoardingRoom,
    BoardingTenancy,
    Booking,
    Commission,
    CommissionRate,
    Favourite,
    Inquiry,
    Listing,
    ListingReport,
    Notification,
    Payment,
    Property,
    PropertyImage,
    PropertyUnit,
    ProviderApplication,
    ProviderPayout,
    Refund,
    Review,
    UserProfile,
    provider_status,
)
from .services import get_profile, house_occupancy, room_occupancy

# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------
PROFILE_FIELDS = [
    "phone_number",
    "town",
    "institution",
    "student_id",
    "emergency_contact_name",
    "emergency_contact_phone",
]


class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = PROFILE_FIELDS + ["active_mode"]
        read_only_fields = ["active_mode"]


def me_payload(user):
    profile = get_profile(user)
    status = provider_status(user)
    provider = getattr(user, "provider_profile", None)
    latest_application = user.provider_applications.order_by("-created_at").first()
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_admin": user.is_staff,
        "provider_status": status,
        "can_use_provider_tools": status == "approved",
        "active_mode": profile.active_mode if status == "approved" else UserProfile.MODE_MARKETPLACE,
        "profile": UserProfileSerializer(profile).data,
        "provider": (
            {
                "business_name": provider.business_name,
                "provider_type": provider.provider_type,
                "status": provider.status,
                "suspension_reason": provider.suspension_reason,
            }
            if provider
            else None
        ),
        "latest_application": ProviderApplicationSerializer(latest_application).data if latest_application else None,
    }


class RegisterSerializer(serializers.Serializer):
    username = serializers.RegexField(r"^[\w.@+-]{3,150}$", error_messages={
        "invalid": "Use 3 to 150 letters, numbers or . @ + - _ for your username."
    })
    email = serializers.EmailField()
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    phone_number = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    town = serializers.CharField(max_length=80, required=False, allow_blank=True, default="Lusaka")

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("That username is already taken.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists. Log in instead.")
        return value

    def validate(self, attrs):
        candidate = User(username=attrs["username"], email=attrs["email"], first_name=attrs["first_name"])
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)})
        return attrs


class LoginSerializer(serializers.Serializer):
    login = serializers.CharField(help_text="Username or email")
    password = serializers.CharField(trim_whitespace=False)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(trim_whitespace=False)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)


class ProviderApplicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProviderApplication
        fields = [
            "id",
            "provider_type",
            "business_name",
            "phone_number",
            "town",
            "business_registration_number",
            "property_count_estimate",
            "description",
            "status",
            "rejection_reason",
            "can_reapply",
            "reviewed_at",
            "created_at",
        ]
        read_only_fields = ["status", "rejection_reason", "can_reapply", "reviewed_at", "created_at"]


class AdminProviderApplicationSerializer(ProviderApplicationSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    full_name = serializers.SerializerMethodField()
    reviewed_by = serializers.CharField(source="reviewed_by.username", read_only=True, default=None)

    class Meta(ProviderApplicationSerializer.Meta):
        fields = ProviderApplicationSerializer.Meta.fields + ["username", "email", "full_name", "reviewed_by"]

    def get_full_name(self, obj):
        return obj.user.get_full_name()


# ---------------------------------------------------------------------------
# Properties and listings
# ---------------------------------------------------------------------------
class PropertyImageSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = PropertyImage
        fields = ["id", "url", "caption", "order"]

    def get_url(self, obj):
        request = self.context.get("request")
        url = obj.image.url
        return request.build_absolute_uri(url) if request else url


class PropertySerializer(serializers.ModelSerializer):
    images = PropertyImageSerializer(many=True, read_only=True)

    class Meta:
        model = Property
        fields = [
            "id",
            "title",
            "description",
            "property_type",
            "bedrooms",
            "bathrooms",
            "size_sqm",
            "furnishing",
            "amenities",
            "address",
            "neighbourhood",
            "town",
            "latitude",
            "longitude",
            "owner_verified",
            "property_verified",
            "images",
        ]
        read_only_fields = ["owner_verified", "property_verified", "images"]

    def validate_amenities(self, value):
        if not isinstance(value, list) or not all(isinstance(v, str) and len(v) <= 40 for v in value):
            raise serializers.ValidationError("Amenities must be a list of short labels.")
        return value[:30]

    def validate(self, attrs):
        lat, lng = attrs.get("latitude"), attrs.get("longitude")
        if lat is not None and not -90 <= lat <= 90:
            raise serializers.ValidationError({"latitude": "Latitude must be between -90 and 90."})
        if lng is not None and not -180 <= lng <= 180:
            raise serializers.ValidationError({"longitude": "Longitude must be between -180 and 180."})
        return attrs


def provider_card(user):
    provider = getattr(user, "provider_profile", None)
    return {
        "id": user.id,
        "name": provider.business_name if provider else user.get_full_name() or user.username,
        "provider_type": provider.provider_type if provider else "",
        "phone_number": provider.phone_number if provider else "",
        "member_since": user.date_joined.year,
    }


class ListingSerializer(serializers.ModelSerializer):
    property = PropertySerializer(read_only=True)
    provider = serializers.SerializerMethodField()
    is_favourite = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = [
            "id",
            "kind",
            "price",
            "status",
            "is_published",
            "booking_mode",
            "available_from",
            "property",
            "provider",
            "is_favourite",
            "rating",
            "created_at",
        ]

    def get_provider(self, obj):
        return provider_card(obj.property.owner)

    def get_is_favourite(self, obj):
        return obj.id in self.context.get("favourite_listing_ids", set())

    def get_rating(self, obj):
        agg = Review.objects.filter(booking__listing=obj).aggregate(avg=Avg("rating"), count=Count("id"))
        return {"average": round(agg["avg"], 1) if agg["avg"] else None, "count": agg["count"]}


class ProviderListingSerializer(ListingSerializer):
    moderation_note = serializers.CharField(read_only=True)
    open_bookings = serializers.SerializerMethodField()

    class Meta(ListingSerializer.Meta):
        fields = ListingSerializer.Meta.fields + ["moderation_note", "open_bookings"]

    def get_open_bookings(self, obj):
        return obj.bookings.filter(status__in=Booking.OPEN_STATUSES).count()


class ListingWriteSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Listing.KINDS)
    price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("1"))
    booking_mode = serializers.ChoiceField(choices=BOOKING_MODES, required=False, default="request")
    available_from = serializers.DateField(required=False, allow_null=True, default=None)
    is_published = serializers.BooleanField(required=False, default=True)


class ListingSearchSerializer(serializers.Serializer):
    bbox = serializers.CharField(required=False)  # "minLng,minLat,maxLng,maxLat"
    q = serializers.CharField(required=False, allow_blank=True, max_length=100)
    kind = serializers.ChoiceField(choices=Listing.KINDS, required=False)
    property_type = serializers.ChoiceField(choices=Property.PROPERTY_TYPES, required=False)
    town = serializers.CharField(required=False, allow_blank=True, max_length=80)
    neighbourhood = serializers.CharField(max_length=100, required=False, allow_blank=True)
    min_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False)
    max_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False)
    bedrooms = serializers.IntegerField(min_value=0, required=False)
    bathrooms = serializers.IntegerField(min_value=0, required=False)
    min_size = serializers.IntegerField(min_value=0, required=False)
    max_size = serializers.IntegerField(min_value=0, required=False)
    furnishing = serializers.ChoiceField(choices=Property.FURNISHING_CHOICES, required=False)
    available_by = serializers.DateField(required=False)
    amenities = serializers.CharField(required=False, allow_blank=True)  # comma separated
    instant = serializers.BooleanField(required=False)
    verified = serializers.BooleanField(required=False)
    sort = serializers.ChoiceField(choices=["newest", "price-asc", "price-desc"], required=False, default="newest")

    def validate_bbox(self, value):
        try:
            west, south, east, north = (float(part) for part in value.split(","))
        except ValueError:
            raise serializers.ValidationError("bbox must be minLng,minLat,maxLng,maxLat.")
        if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
            raise serializers.ValidationError("bbox is out of range or inverted.")
        return (west, south, east, north)

    def validate(self, attrs):
        low, high = attrs.get("min_price"), attrs.get("max_price")
        if low is not None and high is not None and low > high:
            raise serializers.ValidationError("Minimum price can't be above the maximum price.")
        return attrs


class PropertyUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = PropertyUnit
        fields = [
            "id",
            "name",
            "bedrooms",
            "bathrooms",
            "monthly_rent",
            "status",
            "tenant_name",
            "tenant_phone",
            "lease_start",
            "lease_end",
        ]


class ProviderPropertySerializer(PropertySerializer):
    listings = serializers.SerializerMethodField()
    units = PropertyUnitSerializer(many=True, read_only=True)
    boarding_house_id = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()

    class Meta(PropertySerializer.Meta):
        fields = PropertySerializer.Meta.fields + ["listings", "units", "boarding_house_id", "is_owner", "created_at"]

    def get_listings(self, obj):
        return [
            {
                "id": l.id,
                "kind": l.kind,
                "price": str(l.price),
                "status": l.status,
                "is_published": l.is_published,
                "booking_mode": l.booking_mode,
                "available_from": l.available_from,
                "moderation_note": l.moderation_note,
            }
            for l in obj.listings.all()
        ]

    def get_boarding_house_id(self, obj):
        house = getattr(obj, "boarding_house", None)
        return house.id if house else None

    def get_is_owner(self, obj):
        request = self.context.get("request")
        return bool(request and obj.owner_id == request.user.id)


# ---------------------------------------------------------------------------
# Boarding houses
# ---------------------------------------------------------------------------
class BoardingRoomSerializer(serializers.ModelSerializer):
    occupancy = serializers.SerializerMethodField()
    is_shared = serializers.BooleanField(read_only=True)

    class Meta:
        model = BoardingRoom
        fields = [
            "id",
            "name",
            "room_type",
            "capacity",
            "price_per_bed",
            "has_private_bathroom",
            "is_active",
            "is_shared",
            "occupancy",
        ]

    def get_occupancy(self, obj):
        return room_occupancy(obj)


class BoardingHouseSerializer(serializers.ModelSerializer):
    property = PropertySerializer(read_only=True)
    rooms = serializers.SerializerMethodField()
    totals = serializers.SerializerMethodField()
    price_from = serializers.SerializerMethodField()
    provider = serializers.SerializerMethodField()
    is_favourite = serializers.SerializerMethodField()

    class Meta:
        model = BoardingHouse
        fields = [
            "id",
            "name",
            "description",
            "near_institution",
            "gender_policy",
            "amenities",
            "rules",
            "booking_mode",
            "is_active",
            "is_approved",
            "property",
            "rooms",
            "totals",
            "price_from",
            "provider",
            "is_favourite",
        ]

    def _occupancy(self, obj):
        cache = self.context.setdefault("_occ", {})
        if obj.id not in cache:
            cache[obj.id] = house_occupancy(obj)
        return cache[obj.id]

    def get_rooms(self, obj):
        rooms, _ = self._occupancy(obj)
        return [
            {**BoardingRoomSerializer(room).data, "occupancy": occ}
            for room, occ in rooms
            if not self.context.get("only_available") or occ["available"] > 0
        ]

    def get_totals(self, obj):
        return self._occupancy(obj)[1]

    def get_price_from(self, obj):
        prices = [r.price_per_bed for r in obj.rooms.all() if r.is_active]
        return str(min(prices)) if prices else None

    def get_provider(self, obj):
        return provider_card(obj.property.owner)

    def get_is_favourite(self, obj):
        return obj.id in self.context.get("favourite_house_ids", set())


class BoardingHouseWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardingHouse
        fields = [
            "name",
            "description",
            "near_institution",
            "gender_policy",
            "amenities",
            "rules",
            "booking_mode",
            "is_active",
        ]


class BoardingRoomWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardingRoom
        fields = ["name", "room_type", "capacity", "price_per_bed", "has_private_bathroom", "is_active"]

    def validate_price_per_bed(self, value):
        if value <= 0:
            raise serializers.ValidationError("Set a price above zero.")
        return value


class TenancySerializer(serializers.ModelSerializer):
    room_id = serializers.IntegerField(source="room.id", read_only=True)
    room_name = serializers.CharField(source="room.name", read_only=True)
    boarding_house_id = serializers.IntegerField(source="room.boarding_house.id", read_only=True)
    boarding_house_name = serializers.CharField(source="room.boarding_house.name", read_only=True)
    username = serializers.CharField(source="student.username", read_only=True, default=None)
    booking_reference = serializers.CharField(source="booking.reference", read_only=True, default=None)
    balance = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = BoardingTenancy
        fields = [
            "id",
            "room_id",
            "room_name",
            "boarding_house_id",
            "boarding_house_name",
            "username",
            "booking_reference",
            "occupant_name",
            "occupant_phone",
            "institution",
            "student_number",
            "emergency_contact_name",
            "emergency_contact_phone",
            "status",
            "term",
            "check_in_date",
            "check_out_date",
            "lease_end",
            "rent_amount",
            "amount_paid",
            "balance",
            "payment_status",
            "notes",
            "created_at",
        ]
        read_only_fields = ["status", "check_out_date", "created_at"]


class OccupantCreateSerializer(serializers.Serializer):
    room_id = serializers.IntegerField()
    username = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    occupant_name = serializers.CharField(max_length=120)
    occupant_phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    institution = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    student_number = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    emergency_contact_name = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    emergency_contact_phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")
    term = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    check_in_date = serializers.DateField(required=False, allow_null=True, default=None)
    lease_end = serializers.DateField(required=False, allow_null=True, default=None)
    rent_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True, default=None
    )
    amount_paid = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False, default=Decimal("0")
    )
    status = serializers.ChoiceField(
        choices=[BoardingTenancy.STATUS_ACTIVE, BoardingTenancy.STATUS_RESERVED], default=BoardingTenancy.STATUS_ACTIVE
    )

    def validate(self, attrs):
        if attrs["check_in_date"] and attrs["lease_end"] and attrs["lease_end"] <= attrs["check_in_date"]:
            raise serializers.ValidationError({"lease_end": "Lease end must be after the check-in date."})
        return attrs


class TenancyUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardingTenancy
        fields = [
            "occupant_name",
            "occupant_phone",
            "institution",
            "student_number",
            "emergency_contact_name",
            "emergency_contact_phone",
            "term",
            "check_in_date",
            "lease_end",
            "rent_amount",
            "amount_paid",
            "notes",
        ]

    def validate(self, attrs):
        rent = attrs.get("rent_amount", self.instance.rent_amount)
        paid = attrs.get("amount_paid", self.instance.amount_paid)
        if rent < 0 or paid < 0:
            raise serializers.ValidationError("Amounts can't be negative.")
        return attrs

    def save(self, **kwargs):
        tenancy = super().save(**kwargs)
        if tenancy.amount_paid <= 0:
            tenancy.payment_status = BoardingTenancy.PAYMENT_UNPAID
        elif tenancy.amount_paid < tenancy.rent_amount:
            tenancy.payment_status = BoardingTenancy.PAYMENT_PARTIAL
        else:
            tenancy.payment_status = BoardingTenancy.PAYMENT_PAID
        tenancy.save(update_fields=["payment_status"])
        return tenancy


class BoardingSearchSerializer(serializers.Serializer):
    q = serializers.CharField(required=False, allow_blank=True, max_length=100)
    town = serializers.CharField(required=False, allow_blank=True, max_length=80)
    near = serializers.CharField(required=False, allow_blank=True, max_length=150)
    min_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False)
    max_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False)
    room_type = serializers.ChoiceField(choices=BoardingRoom.ROOM_TYPES, required=False)
    sharing = serializers.ChoiceField(choices=["shared", "private"], required=False)
    gender = serializers.ChoiceField(choices=BoardingHouse.GENDER_CHOICES, required=False)
    bbox = serializers.CharField(required=False)

    validate_bbox = ListingSearchSerializer.validate_bbox


# ---------------------------------------------------------------------------
# Bookings and money
# ---------------------------------------------------------------------------
class BookingCreateSerializer(serializers.Serializer):
    listing_id = serializers.IntegerField(required=False)
    room_id = serializers.IntegerField(required=False)
    guest_name = serializers.CharField(max_length=100)
    guest_phone = serializers.RegexField(r"^\+?[0-9 ]{9,16}$", error_messages={
        "invalid": "Enter a phone number like 0977 123456 or +260 977 123456."
    })
    message = serializers.CharField(required=False, allow_blank=True, default="", max_length=1000)
    check_in = serializers.DateField()
    check_out = serializers.DateField(required=False)
    months = serializers.IntegerField(required=False, min_value=1, max_value=24)
    institution = serializers.CharField(max_length=150, required=False, allow_blank=True, default="")
    student_id = serializers.CharField(max_length=50, required=False, allow_blank=True, default="")
    emergency_contact_name = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    emergency_contact_phone = serializers.CharField(max_length=30, required=False, allow_blank=True, default="")

    def validate(self, attrs):
        if bool(attrs.get("listing_id")) == bool(attrs.get("room_id")):
            raise serializers.ValidationError("Book either a listing or a boarding-house room.")
        return attrs


class CommissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Commission
        fields = ["gross_amount", "rate", "amount", "processing_fee", "provider_net", "status"]


class PaymentSerializer(serializers.ModelSerializer):
    booking_reference = serializers.CharField(source="booking.reference", read_only=True)
    refunded_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "booking",
            "booking_reference",
            "gateway",
            "tx_ref",
            "gateway_transaction_id",
            "amount",
            "currency",
            "method",
            "status",
            "checkout_url",
            "failure_reason",
            "refunded_amount",
            "verified_at",
            "created_at",
        ]


class RefundSerializer(serializers.ModelSerializer):
    tx_ref = serializers.CharField(source="payment.tx_ref", read_only=True)
    booking_reference = serializers.CharField(source="payment.booking.reference", read_only=True)

    class Meta:
        model = Refund
        fields = ["id", "tx_ref", "booking_reference", "amount", "reason", "status", "gateway_reference", "created_at", "processed_at"]


class BookingSerializer(serializers.ModelSerializer):
    target = serializers.SerializerMethodField()
    commission = CommissionSerializer(read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    can_pay = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()
    can_review = serializers.SerializerMethodField()
    guest_username = serializers.CharField(source="user.username", read_only=True, default=None)

    class Meta:
        model = Booking
        fields = [
            "id",
            "reference",
            "category",
            "booking_mode",
            "status",
            "guest_name",
            "guest_phone",
            "guest_username",
            "message",
            "check_in",
            "check_out",
            "periods",
            "unit_price",
            "total_amount",
            "payment_due_at",
            "decision_note",
            "decided_at",
            "confirmed_at",
            "cancelled_at",
            "cancelled_by",
            "created_at",
            "target",
            "commission",
            "payments",
            "can_pay",
            "can_cancel",
            "can_review",
        ]

    def get_target(self, obj):
        if obj.listing_id:
            prop = obj.listing.property
            return {
                "type": "listing",
                "listing_id": obj.listing_id,
                "kind": obj.listing.kind,
                "title": prop.title,
                "address": prop.address,
                "neighbourhood": prop.neighbourhood,
                "provider": provider_card(prop.owner),
            }
        house = obj.room.boarding_house
        return {
            "type": "room",
            "boarding_house_id": house.id,
            "room_id": obj.room_id,
            "title": f"{house.name}, {obj.room.name}",
            "address": house.property.address,
            "neighbourhood": house.property.neighbourhood,
            "provider": provider_card(house.property.owner),
        }

    def get_can_pay(self, obj):
        return obj.status == Booking.STATUS_AWAITING_PAYMENT and obj.payment_window_open()

    def get_can_cancel(self, obj):
        if obj.status not in Booking.OPEN_STATUSES + (Booking.STATUS_CONFIRMED,):
            return False
        tenancy = getattr(obj, "tenancy", None)
        return not (tenancy and tenancy.status == BoardingTenancy.STATUS_ACTIVE)

    def get_can_review(self, obj):
        return obj.status == Booking.STATUS_COMPLETED and not hasattr(obj, "review")


class CommissionRateSerializer(serializers.ModelSerializer):
    label = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = CommissionRate
        fields = ["id", "category", "label", "rate", "processing_fee_rate", "updated_at"]
        read_only_fields = ["category", "updated_at"]


class PayoutSerializer(serializers.ModelSerializer):
    provider_username = serializers.CharField(source="provider.username", read_only=True)

    class Meta:
        model = ProviderPayout
        fields = ["id", "provider", "provider_username", "amount", "status", "reference", "created_at", "paid_at"]
        read_only_fields = ["provider", "amount", "created_at", "paid_at"]


# ---------------------------------------------------------------------------
# Engagement
# ---------------------------------------------------------------------------
class InquiryCreateSerializer(serializers.Serializer):
    listing_id = serializers.IntegerField(required=False)
    boarding_house_id = serializers.IntegerField(required=False)
    name = serializers.CharField(max_length=100)
    phone = serializers.CharField(max_length=30)
    message = serializers.CharField(required=False, allow_blank=True, default="", max_length=2000)

    def validate(self, attrs):
        if bool(attrs.get("listing_id")) == bool(attrs.get("boarding_house_id")):
            raise serializers.ValidationError("Send the enquiry about one listing or one boarding house.")
        return attrs


class InquirySerializer(serializers.ModelSerializer):
    about = serializers.SerializerMethodField()
    username = serializers.CharField(source="user.username", read_only=True, default=None)

    class Meta:
        model = Inquiry
        fields = ["id", "name", "phone", "message", "is_read", "created_at", "about", "username"]

    def get_about(self, obj):
        if obj.listing_id:
            return {"type": "listing", "id": obj.listing_id, "title": obj.listing.property.title}
        return {"type": "boarding_house", "id": obj.boarding_house_id, "title": obj.boarding_house.name}


class FavouriteSerializer(serializers.ModelSerializer):
    listing = serializers.SerializerMethodField()
    boarding_house = serializers.SerializerMethodField()

    class Meta:
        model = Favourite
        fields = ["id", "listing", "boarding_house", "created_at"]

    def get_listing(self, obj):
        if not obj.listing_id:
            return None
        return ListingSerializer(obj.listing, context={**self.context, "favourite_listing_ids": {obj.listing_id}}).data

    def get_boarding_house(self, obj):
        if not obj.boarding_house_id:
            return None
        return BoardingHouseSerializer(
            obj.boarding_house, context={**self.context, "favourite_house_ids": {obj.boarding_house_id}}
        ).data


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "body", "link", "is_read", "created_at"]


class ReviewSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Review
        fields = ["id", "rating", "comment", "username", "created_at"]


class ReportSerializer(serializers.ModelSerializer):
    reporter_username = serializers.CharField(source="reporter.username", read_only=True)
    target_title = serializers.SerializerMethodField()

    class Meta:
        model = ListingReport
        fields = [
            "id",
            "listing",
            "boarding_house",
            "reason",
            "details",
            "status",
            "reporter_username",
            "target_title",
            "created_at",
            "resolved_at",
        ]
        read_only_fields = ["status", "created_at", "resolved_at"]

    def get_target_title(self, obj):
        if obj.listing_id:
            return obj.listing.property.title
        if obj.boarding_house_id:
            return obj.boarding_house.name
        return ""

    def validate(self, attrs):
        if bool(attrs.get("listing")) == bool(attrs.get("boarding_house")):
            raise serializers.ValidationError("Report one listing or one boarding house.")
        return attrs
