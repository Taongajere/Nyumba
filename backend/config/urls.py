"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.properties.api import (
    ListingViewSet,
    register_user,
    login_user,
    create_listing,
    create_booking, 
    create_inquiry,
)

router = DefaultRouter()
router.register(r"listings", ListingViewSet)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/register/", register_user),
    path("api/login/", login_user),
    path("api/listings/create/", create_listing),
    path("api/listings/<int:listing_id>/inquire/", create_inquiry),
    path("api/listings/<int:listing_id>/book/", create_booking),
    path("api/", include(router.urls)),
]