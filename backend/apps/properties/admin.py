from django.contrib import admin
from .models import Property, Listing, Inquiry, Booking, Commission

admin.site.register(Property)
admin.site.register(Listing)
admin.site.register(Inquiry)
admin.site.register(Booking)
admin.site.register(Commission)

# Register your models here.
