from django.db import models
from decimal import Decimal
from django.contrib.auth.models import User

class Property(models.Model):   # the physical house
    owner = models.ForeignKey("auth.User", on_delete=models.CASCADE)
    title = models.CharField(max_length=120)
    bedrooms = models.PositiveIntegerField(default=1)
    address = models.CharField(max_length=200)
    # --- NEW: Phase 4 Location Fields ---
    neighbourhood = models.CharField(max_length=100, blank=True, default="")
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    def __str__(self):
        return self.title 

class Listing(models.Model):    # The commercial advert
    KINDS = [("rent", "Rent"), ("sale", "Sale"), ("stay", "Short stay")]
    STATUS_CHOICES = [("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")]
    
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name="listings")
    kind = models.CharField(max_length=10, choices=KINDS)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="pending")
    created_at = models.DateTimeField(auto_now_add=True)


    def __str__(self):
        return f"{self.get_kind_display()} - K{self.price} ({self.status})"

class Inquiry(models.Model):  # Front Desk Clipboard for rentals & sales
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name="inquiries")
    name = models.CharField(max_length=100)
    phone = models.CharField(max_length=30)
    message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Enquiry from {self.name} for {self.listing}"


class Booking(models.Model):  # Hotel reservation slip for short stays
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

class Commission(models.Model):  # Permanent Cash Register receipt for Nyumba's earnings
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name="commission")
    rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.10"))  # 10%
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, default="pending")  # pending, payable, paid, refunded
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"K{self.amount} commission ({self.status})"