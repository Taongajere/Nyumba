from rest_framework import serializers, viewsets
from .models import Listing

class ListingSerializer(serializers.ModelSerializer):
    class Meta:
        model = Listing
        fields = "__all__"

class ListingViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Listing.objects.filter(status="approved")
    serializer_class = ListingSerializer