from django.db import models
from django.contrib.auth.models import User

class Property(models.Model):   # The physical house or apartment
    owner = models.ForeignKey(User, on_delete=models.CASCADE)
    title = models.CharField(max_length=120)
    bedrooms = models.PositiveIntegerField(default=1)
    address = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} ({self.address})"

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
