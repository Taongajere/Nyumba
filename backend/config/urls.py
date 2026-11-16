from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.properties import api

router = DefaultRouter()
router.register(r"listings", api.ListingViewSet, basename="listing")

urlpatterns = [
    path("admin/", admin.site.urls),
    # Accounts
    path("api/register/", api.register_user, name="register"),
    path("api/login/", api.login_user, name="login"),
    path("api/profile/", api.my_profile, name="profile"),
    # Public catalogue and enquiries
    path("api/listings/create/", api.create_listing, name="listing-create"),
    path("api/listings/<int:listing_id>/inquire/", api.create_inquiry, name="listing-inquire"),
    path("api/listings/<int:listing_id>/book/", api.create_booking, name="listing-book"),
    path("api/listings/search/", api.search_listings, name="listing-search"),
    path("api/", include(router.urls)),
    # Provider dashboard and bookings
    path("api/dashboard/", api.owner_dashboard, name="dashboard"),
    path("api/bookings/<int:booking_id>/status/", api.update_booking_status, name="booking-status"),
    # Provider: properties and boarding houses
    path("api/provider/properties/", api.provider_properties, name="provider-properties"),
    path("api/provider/boarding-houses/", api.provider_boarding_houses, name="provider-boarding-houses"),
    path(
        "api/provider/boarding-houses/<int:house_id>/",
        api.provider_boarding_house_detail,
        name="provider-boarding-house-detail",
    ),
    path(
        "api/provider/boarding-houses/<int:house_id>/tenants/",
        api.provider_house_tenants,
        name="provider-house-tenants",
    ),
    path(
        "api/provider/tenancies/<int:tenancy_id>/",
        api.provider_tenancy_update,
        name="provider-tenancy-update",
    ),
    path("api/provider/tenancies/<int:tenancy_id>/approve/", api.approve_tenancy, name="tenancy-approve"),
    path("api/provider/tenancies/<int:tenancy_id>/reject/", api.reject_tenancy, name="tenancy-reject"),
    path("api/provider/tenancies/<int:tenancy_id>/checkout/", api.checkout_tenancy, name="tenancy-checkout"),
    # Student: boarding houses
    path("api/boarding-houses/", api.browse_boarding_houses, name="boarding-houses-browse"),
    path(
        "api/boarding-houses/<int:house_id>/apply/",
        api.apply_boarding_house,
        name="boarding-house-apply",
    ),
    path("api/student/placement/", api.my_placement, name="student-placement"),
    path("api/student/tenancies/<int:tenancy_id>/cancel/", api.cancel_tenancy, name="student-tenancy-cancel"),
]
