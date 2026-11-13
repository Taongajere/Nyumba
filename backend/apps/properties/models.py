from django.db import models
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

