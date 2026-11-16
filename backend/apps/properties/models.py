from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Q


class UserProfile(models.Model):
    """Role and profile details for every account.

    role:      provider (landlord / boarding house manager) or user (seeker).
    user_type: seekers only, student or general_seeker. Empty for providers.
    """

    ROLE_PROVIDER = "provider"
    ROLE_USER = "user"
    ROLE_CHOICES = [
        (ROLE_PROVIDER, "Provider"),
        (ROLE_USER, "Seeker"),
    ]

    TYPE_STUDENT = "student"
    TYPE_GENERAL = "general_seeker"
    USER_TYPE_CHOICES = [
        (TYPE_STUDENT, "Student"),
        (TYPE_GENERAL, "General seeker"),
    ]

    VERIFY_UNVERIFIED = "unverified"
    VERIFY_PENDING = "pending"
    VERIFY_VERIFIED = "verified"
    VERIFY_REJECTED = "rejected"
    VERIFICATION_CHOICES = [
        (VERIFY_UNVERIFIED, "Unverified"),
        (VERIFY_PENDING, "Pending review"),
        (VERIFY_VERIFIED, "Verified"),
        (VERIFY_REJECTED, "Rejected"),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_USER)
    user_type = models.CharField(max_length=20, choices=USER_TYPE_CHOICES, blank=True, default="")
    phone_number = models.CharField(max_length=30, blank=True, default="")

    # Provider fields
    business_name = models.CharField(max_length=120, blank=True, default="")
    verification_status = models.CharField(
        max_length=20, choices=VERIFICATION_CHOICES, default=VERIFY_UNVERIFIED
    )

    # Student fields
    institution = models.CharField(max_length=150, blank=True, default="")
    student_id = models.CharField(max_length=50, blank=True, default="")
    emergency_contact_name = models.CharField(max_length=100, blank=True, default="")
    emergency_contact_phone = models.CharField(max_length=30, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_provider(self):
        return self.role == self.ROLE_PROVIDER

    @property
    def is_student(self):
        return self.role == self.ROLE_USER and self.user_type == self.TYPE_STUDENT

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()})"


class Property(models.Model):  # the physical house
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=120)
    bedrooms = models.PositiveIntegerField(default=1)
    address = models.CharField(max_length=200)
    neighbourhood = models.CharField(max_length=100, blank=True, default="")
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    # Two-lock verification (Phase 7)
    owner_verified = models.BooleanField(default=False)
    property_verified = models.BooleanField(default=False)

    def __str__(self):
        return self.title


class BoardingHouse(models.Model):
    """A property run as a boarding house with a fixed number of bed spaces."""

    property = models.OneToOneField(
        Property, on_delete=models.CASCADE, related_name="boarding_house"
    )
    name = models.CharField(max_length=120)
    capacity = models.PositiveIntegerField(help_text="Total bed spaces.")
    rent_per_bed = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.capacity} beds)"


class Listing(models.Model):  # The commercial advert
    KINDS = [("rent", "Rent"), ("sale", "Sale"), ("stay", "Short stay")]
    STATUS_CHOICES = [("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")]

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="listings")
    kind = models.CharField(max_length=10, choices=KINDS)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.get_kind_display()} - K{self.price} ({self.status})"


class Inquiry(models.Model):  # Front desk clipboard for rentals & sales
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="inquiries")
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=30)
    message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Enquiry from {self.name} for {self.listing}"


class Booking(models.Model):  # Reservation slip for short stays
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="bookings")
    guest_name = models.CharField(max_length=100)
    guest_phone = models.CharField(max_length=30)
    check_in = models.DateField()
    check_out = models.DateField()
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, default="requested")  # requested, confirmed, cancelled
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.guest_name} ({self.check_in} to {self.check_out})"


class Commission(models.Model):  # Record of Nyumba's earnings per booking
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name="commission")
    rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.10"))  # 10%
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, default="pending")  # pending, payable, paid, refunded
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"K{self.amount} commission ({self.status})"


class BoardingTenancy(models.Model):
    """One seeker's place in a boarding house, from request through checkout."""

    STATUS_REQUESTED = "requested"
    STATUS_ACTIVE = "active"
    STATUS_CHECKED_OUT = "checked_out"
    STATUS_REJECTED = "rejected"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = [
        (STATUS_REQUESTED, "Requested"),
        (STATUS_ACTIVE, "Active"),
        (STATUS_CHECKED_OUT, "Checked out"),
        (STATUS_REJECTED, "Rejected"),
        (STATUS_CANCELLED, "Cancelled"),
    ]
    OPEN_STATUSES = (STATUS_REQUESTED, STATUS_ACTIVE)

    PAYMENT_UNPAID = "unpaid"
    PAYMENT_PARTIAL = "partial"
    PAYMENT_PAID = "paid"
    PAYMENT_CHOICES = [
        (PAYMENT_UNPAID, "Unpaid"),
        (PAYMENT_PARTIAL, "Partially paid"),
        (PAYMENT_PAID, "Paid"),
    ]

    boarding_house = models.ForeignKey(
        BoardingHouse, on_delete=models.CASCADE, related_name="tenancies"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tenancies"
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_REQUESTED)
    term = models.CharField(max_length=60, blank=True, default="", help_text="e.g. 2027 Semester 1")
    move_in_date = models.DateField(null=True, blank=True)
    move_out_date = models.DateField(null=True, blank=True)
    lease_end = models.DateField(null=True, blank=True)
    rent_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    payment_status = models.CharField(max_length=20, choices=PAYMENT_CHOICES, default=PAYMENT_UNPAID)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # A student can hold at most one requested or active place at a time.
            models.UniqueConstraint(
                fields=["student"],
                condition=Q(status__in=["requested", "active"]),
                name="one_open_tenancy_per_student",
            ),
        ]

    def __str__(self):
        return f"{self.student.username} @ {self.boarding_house.name} ({self.status})"

    @property
    def balance(self):
        return self.rent_amount - self.amount_paid
