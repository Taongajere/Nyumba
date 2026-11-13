from rest_framework import serializers, viewsets
from .models import Property, Listing

class PropertySerializer(serializers.ModelSerializer):
    class Meta:
        model = Property
        fields = ["id", "title", "bedrooms", "address"]

class ListingSerializer(serializers.ModelSerializer):
    property = PropertySerializer(read_only=True)

    class Meta: 
        model = Listing
        fields = ["id", "kind", "price", "status", "property"]

class ListingViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Listing.objects.filter(status="approved")
    serializer_class = ListingSerializer