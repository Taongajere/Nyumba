"""Nyumba data model.

Accounts:      User (Django) -> UserProfile (one per user)
               ProviderApplication (history of requests to become a provider)
               ProviderProfile (exists once an application is approved; holds approved/suspended state)
Marketplace:   Property -> Listing (rent / sale / short stay adverts)
               Property -> PropertyImage, PropertyUnit
Boarding:      Property -> BoardingHouse -> BoardingRoom -> BoardingTenancy (occupants)
Transactions:  Booking -> Commission (financial breakdown) -> Payment -> Refund
               ProviderPayout, CommissionRate (admin-configurable rates)
Engagement:    Inquiry, Favourite, Notification, Review, ListingReport
"""

import secrets
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone

MONEY = {"max_digits": 12, "decimal_places": 2}
ZERO = Decimal("0.00")


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------
class UserProfile(models.Model):
    """Personal details for every account. One account per person.

    Provider access is not stored here: it comes from ProviderProfile.status,
    which only an administrator can set. `active_mode` remembers which
    experience (marketplace or provider tools) the person last chose, so web
    and mobile clients open in the same place.
    """

    MODE_MARKETPLACE = "marketplace"
    MODE_PROVIDER = "provider"
    MODE_CHOICES = [(MODE_MARKETPLACE, "Marketplace"), (MODE_PROVIDER, "Provider")]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    phone_number = models.CharField(max_length=30, blank=True, default="")
    town = models.CharField(max_length=80, blank=True, default="Lusaka")
    active_mode = models.CharField(max_length=12, choices=MODE_CHOICES, default=MODE_MARKETPLACE)

    # Optional student details, asked for when booking a boarding-house bed.
    institution = models.CharField(max_length=150, blank=True, default="")
    student_id = models.CharField(max_length=50, blank=True, default="")
    emergency_contact_name = models.CharField(max_length=100, blank=True, default="")
    emergency_contact_phone = models.CharField(max_length=30, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} profile"


class ProviderApplication(models.Model):
    """A request to become a provider. A user may reapply after a rejection."""

    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
    ]

    TYPE_LANDLORD = "landlord"
    TYPE_AGENT = "agent"
    TYPE_MANAGER = "property_manager"
    TYPE_BOARDING = "boarding_house"
    TYPE_HOST = "short_stay_host"
    PROVIDER_TYPES = [
        (TYPE_LANDLORD, "Landlord / owner"),
        (TYPE_AGENT, "Estate agent"),
        (TYPE_MANAGER, "Property manager"),
        (TYPE_BOARDING, "Boarding-house operator"),
        (TYPE_HOST, "Short-stay host"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="provider_applications"
    )
    provider_type = models.CharField(max_length=20, choices=PROVIDER_TYPES)
    business_name = models.CharField(max_length=120)
    phone_number = models.CharField(max_length=30)
    town = models.CharField(max_length=80, default="Lusaka")
    business_registration_number = models.CharField(max_length=60, blank=True, default="")
    property_count_estimate = models.PositiveIntegerField(default=1)
    description = models.TextField(blank=True, default="")

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    rejection_reason = models.TextField(blank=True, default="")
    can_reapply = models.BooleanField(default=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_provider_applications",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user"],
                condition=Q(status="pending"),
                name="one_pending_provider_application",
            )
        ]
        indexes = [models.Index(fields=["status", "created_at"])]

    def __str__(self):
        return f"{self.business_name} ({self.status})"


class ProviderProfile(models.Model):
    """Created when an application is approved. Suspension removes provider access."""

    STATUS_APPROVED = "approved"
    STATUS_SUSPENDED = "suspended"
    STATUS_CHOICES = [(STATUS_APPROVED, "Approved"), (STATUS_SUSPENDED, "Suspended")]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="provider_profile"
    )
    application = models.ForeignKey(
        ProviderApplication, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    provider_type = models.CharField(max_length=20, choices=ProviderApplication.PROVIDER_TYPES)
    business_name = models.CharField(max_length=120)
    phone_number = models.CharField(max_length=30, blank=True, default="")
    bio = models.TextField(blank=True, default="")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_APPROVED)
    suspension_reason = models.TextField(blank=True, default="")
    approved_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_active(self):
        return self.status == self.STATUS_APPROVED

    def __str__(self):
        return f"{self.business_name} ({self.status})"


def provider_status(user):
    """One word describing the user's provider standing, for clients and permission checks.

    none | pending | rejected | approved | suspended
    """
    profile = getattr(user, "provider_profile", None)
    if profile is not None:
        return profile.status
    latest = user.provider_applications.order_by("-created_at").first()
    return latest.status if latest else "none"


# ---------------------------------------------------------------------------
# Properties and listings
# ---------------------------------------------------------------------------
class Property(models.Model):
    """The physical place. Adverts (Listing) and boarding houses hang off it."""

    TYPE_HOUSE = "house"
    TYPE_APARTMENT = "apartment"
    TYPE_TOWNHOUSE = "townhouse"
    TYPE_COTTAGE = "cottage"
    TYPE_ROOM = "room"
    TYPE_BOARDING = "boarding_house"
    TYPE_COMMERCIAL = "commercial"
    TYPE_LAND = "land"
    PROPERTY_TYPES = [
        (TYPE_HOUSE, "House"),
        (TYPE_APARTMENT, "Apartment / flat"),
        (TYPE_TOWNHOUSE, "Townhouse"),
        (TYPE_COTTAGE, "Cottage"),
        (TYPE_ROOM, "Room"),
        (TYPE_BOARDING, "Boarding house"),
        (TYPE_COMMERCIAL, "Commercial"),
        (TYPE_LAND, "Land / plot"),
    ]

    FURNISHED = "furnished"
    SEMI_FURNISHED = "semi_furnished"
    UNFURNISHED = "unfurnished"
    FURNISHING_CHOICES = [
        (FURNISHED, "Furnished"),
        (SEMI_FURNISHED, "Semi-furnished"),
        (UNFURNISHED, "Unfurnished"),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="properties"
    )
    # Other provider accounts the owner authorises to manage this property.
    managers = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="managed_properties"
    )
    title = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    property_type = models.CharField(max_length=20, choices=PROPERTY_TYPES, default=TYPE_HOUSE)
    bedrooms = models.PositiveIntegerField(default=1)
    bathrooms = models.PositiveIntegerField(default=1)
    size_sqm = models.PositiveIntegerField(null=True, blank=True)
    furnishing = models.CharField(max_length=20, choices=FURNISHING_CHOICES, default=UNFURNISHED)
    amenities = models.JSONField(default=list, blank=True)
    address = models.CharField(max_length=200)
    neighbourhood = models.CharField(max_length=100, blank=True, default="")
    town = models.CharField(max_length=80, default="Lusaka")
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    # Two-lock verification, set by administrators.
    owner_verified = models.BooleanField(default=False)
    property_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "properties"
        indexes = [
            models.Index(fields=["latitude", "longitude"]),
            models.Index(fields=["town", "neighbourhood"]),
        ]

    def __str__(self):
        return self.title

    def can_manage(self, user):
        return self.owner_id == user.id or self.managers.filter(id=user.id).exists()


def property_image_path(instance, filename):
    return f"properties/{instance.property_id}/{filename}"


class PropertyImage(models.Model):
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to=property_image_path)
    caption = models.CharField(max_length=120, blank=True, default="")
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "id"]


class PropertyUnit(models.Model):
    """A rentable unit inside a property (a flat in a block, a cottage on a plot)."""

    STATUS_AVAILABLE = "available"
    STATUS_OCCUPIED = "occupied"
    STATUS_MAINTENANCE = "maintenance"
    STATUS_CHOICES = [
        (STATUS_AVAILABLE, "Available"),
        (STATUS_OCCUPIED, "Occupied"),
        (STATUS_MAINTENANCE, "Under maintenance"),
    ]

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="units")
    name = models.CharField(max_length=60)
    bedrooms = models.PositiveIntegerField(default=1)
    bathrooms = models.PositiveIntegerField(default=1)
    monthly_rent = models.DecimalField(**MONEY, default=ZERO)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_AVAILABLE)
    tenant_name = models.CharField(max_length=120, blank=True, default="")
    tenant_phone = models.CharField(max_length=30, blank=True, default="")
    lease_start = models.DateField(null=True, blank=True)
    lease_end = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["property", "name"], name="unique_unit_name_per_property")
        ]

    def __str__(self):
        return f"{self.property.title} / {self.name}"


def new_booking_reference():
    """Short, unambiguous reference people can read out on the phone, e.g. NY-7K2M9QX4."""
    alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
    return "NY-" + "".join(secrets.choice(alphabet) for _ in range(8))


BOOKING_REQUEST = "request"
BOOKING_INSTANT = "instant"
BOOKING_MODES = [(BOOKING_REQUEST, "Request to book"), (BOOKING_INSTANT, "Instant booking")]


class Listing(models.Model):
    """The commercial advert for a property: rent, sale or short stay.

    `status` is the administrator's moderation decision.
    `is_published` is the provider's own on/off switch.
    Only approved + published listings from active providers are public.
    """

    KINDS = [("rent", "Rent"), ("sale", "Sale"), ("stay", "Short stay")]
    STATUS_PENDING = "pending"
    STATUS_APPROVED = "approved"
    STATUS_REJECTED = "rejected"
    STATUS_REMOVED = "removed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending review"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_REMOVED, "Removed by admin"),
    ]

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="listings")
    kind = models.CharField(max_length=10, choices=KINDS)
    price = models.DecimalField(**MONEY)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    is_published = models.BooleanField(default=True)
    booking_mode = models.CharField(max_length=10, choices=BOOKING_MODES, default=BOOKING_REQUEST)
    available_from = models.DateField(null=True, blank=True)
    moderation_note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["status", "is_published", "kind"]),
            models.Index(fields=["price"]),
        ]

    def __str__(self):
        return f"{self.get_kind_display()} - K{self.price} ({self.status})"

    @classmethod
    def public(cls):
        """The only queryset that should ever feed public search results."""
        return cls.objects.filter(
            status=cls.STATUS_APPROVED,
            is_published=True,
            property__owner__provider_profile__status=ProviderProfile.STATUS_APPROVED,
        )


# ---------------------------------------------------------------------------
# Boarding houses: Property -> BoardingHouse -> BoardingRoom -> BoardingTenancy
# ---------------------------------------------------------------------------
class BoardingHouse(models.Model):
    GENDER_MIXED = "mixed"
    GENDER_FEMALE = "female"
    GENDER_MALE = "male"
    GENDER_CHOICES = [
        (GENDER_MIXED, "Mixed"),
        (GENDER_FEMALE, "Female only"),
        (GENDER_MALE, "Male only"),
    ]

    property = models.OneToOneField(
        Property, on_delete=models.CASCADE, related_name="boarding_house"
    )
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    near_institution = models.CharField(max_length=150, blank=True, default="")
    gender_policy = models.CharField(max_length=10, choices=GENDER_CHOICES, default=GENDER_MIXED)
    amenities = models.JSONField(default=list, blank=True)
    rules = models.TextField(blank=True, default="")
    booking_mode = models.CharField(max_length=10, choices=BOOKING_MODES, default=BOOKING_REQUEST)
    is_active = models.BooleanField(default=True)  # provider's publish switch
    is_approved = models.BooleanField(default=False)  # administrator's moderation
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    @classmethod
    def public(cls):
        return cls.objects.filter(
            is_active=True,
            is_approved=True,
            property__owner__provider_profile__status=ProviderProfile.STATUS_APPROVED,
        )


class BoardingRoom(models.Model):
    ROOM_SINGLE = "single"
    ROOM_DOUBLE = "double"
    ROOM_TRIPLE = "triple"
    ROOM_DORM = "dorm"
    ROOM_SELF_CONTAINED = "self_contained"
    ROOM_TYPES = [
        (ROOM_SINGLE, "Single"),
        (ROOM_DOUBLE, "Double"),
        (ROOM_TRIPLE, "Triple"),
        (ROOM_DORM, "Dormitory (4+)"),
        (ROOM_SELF_CONTAINED, "Self-contained"),
    ]

    boarding_house = models.ForeignKey(BoardingHouse, on_delete=models.CASCADE, related_name="rooms")
    name = models.CharField(max_length=40)
    room_type = models.CharField(max_length=20, choices=ROOM_TYPES, default=ROOM_SINGLE)
    capacity = models.PositiveIntegerField(validators=[MinValueValidator(1), MaxValueValidator(20)])
    price_per_bed = models.DecimalField(**MONEY, help_text="Monthly price for one bed space.")
    has_private_bathroom = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["boarding_house", "name"], name="unique_room_name_per_house"),
            models.CheckConstraint(condition=Q(capacity__gte=1), name="room_capacity_positive"),
        ]

    def __str__(self):
        return f"{self.boarding_house.name} / {self.name}"

    @property
    def is_shared(self):
        return self.capacity > 1


class BoardingTenancy(models.Model):
    """One occupant's bed in a room.

    reserved:    paid booking, not yet moved in (holds a bed)
    active:      checked in (holds a bed)
    checked_out: left; bed is free again
    cancelled:   reservation cancelled before check-in
    """

    STATUS_RESERVED = "reserved"
    STATUS_ACTIVE = "active"
    STATUS_CHECKED_OUT = "checked_out"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = [
        (STATUS_RESERVED, "Reserved"),
        (STATUS_ACTIVE, "Checked in"),
        (STATUS_CHECKED_OUT, "Checked out"),
        (STATUS_CANCELLED, "Cancelled"),
    ]
    BED_HOLDING_STATUSES = (STATUS_RESERVED, STATUS_ACTIVE)

    PAYMENT_UNPAID = "unpaid"
    PAYMENT_PARTIAL = "partial"
    PAYMENT_PAID = "paid"
    PAYMENT_CHOICES = [
        (PAYMENT_UNPAID, "Unpaid"),
        (PAYMENT_PARTIAL, "Partially paid"),
        (PAYMENT_PAID, "Paid"),
    ]

    room = models.ForeignKey(BoardingRoom, on_delete=models.PROTECT, related_name="tenancies")
    # Set when the occupant has a Nyumba account; providers can also register walk-in occupants.
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="tenancies",
    )
    booking = models.OneToOneField(
        "Booking", null=True, blank=True, on_delete=models.SET_NULL, related_name="tenancy"
    )
    occupant_name = models.CharField(max_length=120)
    occupant_phone = models.CharField(max_length=30, blank=True, default="")
    institution = models.CharField(max_length=150, blank=True, default="")
    student_number = models.CharField(max_length=50, blank=True, default="")
    emergency_contact_name = models.CharField(max_length=100, blank=True, default="")
    emergency_contact_phone = models.CharField(max_length=30, blank=True, default="")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    term = models.CharField(max_length=60, blank=True, default="", help_text="e.g. 2027 Semester 1")
    check_in_date = models.DateField(null=True, blank=True)
    check_out_date = models.DateField(null=True, blank=True)
    lease_end = models.DateField(null=True, blank=True)
    rent_amount = models.DecimalField(**MONEY, default=ZERO)
    amount_paid = models.DecimalField(**MONEY, default=ZERO)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_CHOICES, default=PAYMENT_UNPAID)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "boarding tenancies"
        constraints = [
            # An account can hold at most one bed at a time.
            models.UniqueConstraint(
                fields=["student"],
                condition=Q(status__in=["reserved", "active"]),
                name="one_open_tenancy_per_student",
            ),
        ]
        indexes = [models.Index(fields=["room", "status"])]

    def __str__(self):
        return f"{self.occupant_name} @ {self.room} ({self.status})"

    @property
    def balance(self):
        return self.rent_amount - self.amount_paid


# ---------------------------------------------------------------------------
# Enquiries, bookings, money
# ---------------------------------------------------------------------------
class Inquiry(models.Model):
    """A message to a provider about a listing or a boarding house."""

    listing = models.ForeignKey(
        Listing, null=True, blank=True, on_delete=models.CASCADE, related_name="inquiries"
    )
    boarding_house = models.ForeignKey(
        BoardingHouse, null=True, blank=True, on_delete=models.CASCADE, related_name="inquiries"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="inquiries"
    )
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=30)
    message = models.TextField(blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "inquiries"
        constraints = [
            models.CheckConstraint(
                condition=Q(listing__isnull=False) | Q(boarding_house__isnull=False),
                name="inquiry_has_target",
            )
        ]

    def __str__(self):
        return f"Enquiry from {self.name}"


class Booking(models.Model):
    """A reservation of a short stay, a rental, or a boarding-house bed.

    Request flow:  pending -> accepted/awaiting_payment -> confirmed -> completed
                   pending -> rejected
    Instant flow:  awaiting_payment -> confirmed -> completed
    Any open state can become cancelled. Unpaid holds expire at payment_due_at.
    """

    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_REJECTED = "rejected"
    STATUS_AWAITING_PAYMENT = "awaiting_payment"
    STATUS_CONFIRMED = "confirmed"
    STATUS_CANCELLED = "cancelled"
    STATUS_COMPLETED = "completed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_ACCEPTED, "Accepted"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_AWAITING_PAYMENT, "Awaiting payment"),
        (STATUS_CONFIRMED, "Confirmed"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_COMPLETED, "Completed"),
    ]
    # States that hold inventory (dates or a bed). awaiting_payment only while unexpired.
    HOLDING_STATUSES = (STATUS_PENDING, STATUS_ACCEPTED, STATUS_AWAITING_PAYMENT, STATUS_CONFIRMED)
    OPEN_STATUSES = (STATUS_PENDING, STATUS_ACCEPTED, STATUS_AWAITING_PAYMENT)

    CATEGORY_STAY = "stay"
    CATEGORY_RENT = "rent"
    CATEGORY_BOARDING = "boarding"
    CATEGORIES = [
        (CATEGORY_STAY, "Short stay"),
        (CATEGORY_RENT, "Rental"),
        (CATEGORY_BOARDING, "Boarding house"),
    ]

    reference = models.CharField(max_length=20, unique=True, default=new_booking_reference, editable=False)
    category = models.CharField(max_length=10, choices=CATEGORIES, default=CATEGORY_STAY)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="bookings"
    )
    listing = models.ForeignKey(
        Listing, null=True, blank=True, on_delete=models.PROTECT, related_name="bookings"
    )
    room = models.ForeignKey(
        BoardingRoom, null=True, blank=True, on_delete=models.PROTECT, related_name="bookings"
    )
    booking_mode = models.CharField(max_length=10, choices=BOOKING_MODES, default=BOOKING_REQUEST)
    guest_name = models.CharField(max_length=100)
    guest_phone = models.CharField(max_length=30)
    message = models.TextField(blank=True, default="")
    check_in = models.DateField()
    check_out = models.DateField()
    periods = models.PositiveIntegerField(default=1, help_text="Nights for stays, months otherwise.")
    unit_price = models.DecimalField(**MONEY, default=ZERO)
    total_amount = models.DecimalField(**MONEY)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    payment_due_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True, default="")
    decided_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.CharField(max_length=10, blank=True, default="")  # guest | provider | admin | system
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=(Q(listing__isnull=False, room__isnull=True) | Q(listing__isnull=True, room__isnull=False)),
                name="booking_has_one_target",
            ),
            models.CheckConstraint(condition=Q(check_out__gt=models.F("check_in")), name="booking_dates_ordered"),
        ]
        indexes = [
            models.Index(fields=["listing", "status", "check_in", "check_out"]),
            models.Index(fields=["room", "status"]),
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self):
        return f"{self.reference} {self.guest_name} ({self.status})"

    @property
    def provider(self):
        if self.listing_id:
            return self.listing.property.owner
        return self.room.boarding_house.property.owner

    @property
    def target_title(self):
        if self.listing_id:
            return self.listing.property.title
        return f"{self.room.boarding_house.name}, {self.room.name}"

    def payment_window_open(self):
        return self.payment_due_at is None or self.payment_due_at > timezone.now()


class CommissionRate(models.Model):
    """Administrator-editable commission and fee rates, one row per booking category."""

    category = models.CharField(max_length=10, choices=Booking.CATEGORIES, unique=True)
    rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=Decimal("0.1000"),
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("0.5"))],
        help_text="Nyumba commission as a fraction, e.g. 0.10 for 10%.",
    )
    processing_fee_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=Decimal("0.0000"),
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("0.2"))],
        help_text="Gateway fee passed to the provider, as a fraction of the booking value.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.get_category_display()}: {self.rate * 100:.2f}%"


class Commission(models.Model):
    """Financial breakdown of one booking: what Nyumba keeps and what the provider gets."""

    STATUS_PENDING = "pending"  # booking not paid yet
    STATUS_EARNED = "earned"  # payment verified
    STATUS_PAID_OUT = "paid_out"  # provider share settled
    STATUS_REFUNDED = "refunded"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_EARNED, "Earned"),
        (STATUS_PAID_OUT, "Paid out"),
        (STATUS_REFUNDED, "Refunded"),
    ]

    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name="commission")
    gross_amount = models.DecimalField(**MONEY, default=ZERO)
    rate = models.DecimalField(max_digits=5, decimal_places=4, default=Decimal("0.10"))
    amount = models.DecimalField(**MONEY)
    processing_fee = models.DecimalField(**MONEY, default=ZERO)
    provider_net = models.DecimalField(**MONEY, default=ZERO)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    payout = models.ForeignKey(
        "ProviderPayout", null=True, blank=True, on_delete=models.SET_NULL, related_name="commissions"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"K{self.amount} commission ({self.status})"


class Payment(models.Model):
    STATUS_INITIATED = "initiated"
    STATUS_SUCCESSFUL = "successful"
    STATUS_FAILED = "failed"
    STATUS_CANCELLED = "cancelled"
    STATUS_REFUNDED = "refunded"
    STATUS_PARTIALLY_REFUNDED = "partially_refunded"
    STATUS_CHOICES = [
        (STATUS_INITIATED, "Initiated"),
        (STATUS_SUCCESSFUL, "Successful"),
        (STATUS_FAILED, "Failed"),
        (STATUS_CANCELLED, "Cancelled"),
        (STATUS_REFUNDED, "Refunded"),
        (STATUS_PARTIALLY_REFUNDED, "Partially refunded"),
    ]

    booking = models.ForeignKey(Booking, on_delete=models.PROTECT, related_name="payments")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payments")
    gateway = models.CharField(max_length=20)  # flutterwave | sandbox
    tx_ref = models.CharField(max_length=64, unique=True)
    gateway_transaction_id = models.CharField(max_length=64, null=True, blank=True, unique=True)
    amount = models.DecimalField(**MONEY)
    currency = models.CharField(max_length=3, default="ZMW")
    method = models.CharField(max_length=30, blank=True, default="")  # card | mobilemoneyzambia
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_INITIATED)
    checkout_url = models.URLField(max_length=500, blank=True, default="")
    gateway_response = models.JSONField(default=dict, blank=True)
    failure_reason = models.CharField(max_length=255, blank=True, default="")
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "created_at"])]

    def __str__(self):
        return f"{self.tx_ref} {self.amount} {self.currency} ({self.status})"

    @property
    def refunded_amount(self):
        return sum((r.amount for r in self.refunds.exclude(status=Refund.STATUS_FAILED)), ZERO)


class Refund(models.Model):
    STATUS_PENDING = "pending"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_FAILED, "Failed"),
    ]

    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="refunds")
    amount = models.DecimalField(**MONEY)
    reason = models.CharField(max_length=255)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    gateway_reference = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class ProviderPayout(models.Model):
    STATUS_PENDING = "pending"
    STATUS_PAID = "paid"
    STATUS_CHOICES = [(STATUS_PENDING, "Pending"), (STATUS_PAID, "Paid")]

    provider = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payouts")
    amount = models.DecimalField(**MONEY)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING)
    reference = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


# ---------------------------------------------------------------------------
# Engagement
# ---------------------------------------------------------------------------
class Favourite(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="favourites")
    listing = models.ForeignKey(
        Listing, null=True, blank=True, on_delete=models.CASCADE, related_name="favourited_by"
    )
    boarding_house = models.ForeignKey(
        BoardingHouse, null=True, blank=True, on_delete=models.CASCADE, related_name="favourited_by"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(listing__isnull=False, boarding_house__isnull=True)
                    | Q(listing__isnull=True, boarding_house__isnull=False)
                ),
                name="favourite_has_one_target",
            ),
            models.UniqueConstraint(
                fields=["user", "listing"], condition=Q(listing__isnull=False), name="unique_favourite_listing"
            ),
            models.UniqueConstraint(
                fields=["user", "boarding_house"],
                condition=Q(boarding_house__isnull=False),
                name="unique_favourite_boarding_house",
            ),
        ]


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=40)
    title = models.CharField(max_length=160)
    body = models.TextField(blank=True, default="")
    link = models.CharField(max_length=200, blank=True, default="")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "is_read", "created_at"])]


class Review(models.Model):
    """Only a guest with a completed booking can review, once per booking."""

    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name="review")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(rating__gte=1, rating__lte=5), name="review_rating_range")
        ]


class ListingReport(models.Model):
    STATUS_OPEN = "open"
    STATUS_RESOLVED = "resolved"
    STATUS_DISMISSED = "dismissed"
    STATUS_CHOICES = [(STATUS_OPEN, "Open"), (STATUS_RESOLVED, "Resolved"), (STATUS_DISMISSED, "Dismissed")]

    listing = models.ForeignKey(
        Listing, null=True, blank=True, on_delete=models.CASCADE, related_name="reports"
    )
    boarding_house = models.ForeignKey(
        BoardingHouse, null=True, blank=True, on_delete=models.CASCADE, related_name="reports"
    )
    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reports")
    reason = models.CharField(max_length=40)
    details = models.TextField(blank=True, default="")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


def payment_hold_deadline():
    return timezone.now() + timedelta(minutes=settings.NYUMBA_PAYMENT_HOLD_MINUTES)
