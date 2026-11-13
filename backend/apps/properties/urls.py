from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .api import ListingViewSet

router = DefaultRouter()
router.register(r'listings', ListingViewSet, basename='listing')

urlpatterns = [
    path('', include(router.urls)),
]