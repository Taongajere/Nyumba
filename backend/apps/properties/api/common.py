from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

from ..services import BusinessRuleError


def _first_message(errors):
    first = errors
    while isinstance(first, dict) and first:
        first = next(iter(first.values()))
    if isinstance(first, list) and first:
        first = first[0]
        if isinstance(first, (dict, list)):
            return _first_message(first)
    return str(first) if first else "Please check the form and try again."


def api_exception_handler(exc, context):
    """Every error leaves the API as {"error": "...", "fields": {...}?}."""
    if isinstance(exc, BusinessRuleError):
        return Response({"error": exc.message}, status=exc.status_code)
    response = exception_handler(exc, context)
    if response is None:
        return None
    if isinstance(exc, ValidationError):
        response.data = {"error": _first_message(response.data), "fields": response.data}
    elif isinstance(response.data, dict) and "detail" in response.data:
        response.data = {"error": str(response.data["detail"])}
    return response


def validated(serializer_class, data, **kwargs):
    serializer = serializer_class(data=data, **kwargs)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def not_found(message="Not found."):
    return Response({"error": message}, status=status.HTTP_404_NOT_FOUND)


def parse_date(value):
    from datetime import date

    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise BusinessRuleError("Dates must look like 2026-12-31.")


def paginate(request, queryset, serializer_class, context=None, default_size=20, max_size=100):
    """Simple page/page_size pagination that mobile clients can follow."""
    try:
        page = max(int(request.query_params.get("page", 1)), 1)
        size = min(max(int(request.query_params.get("page_size", default_size)), 1), max_size)
    except ValueError:
        raise BusinessRuleError("page and page_size must be numbers.")
    total = queryset.count()
    items = queryset[(page - 1) * size : page * size]
    return Response(
        {
            "count": total,
            "page": page,
            "page_size": size,
            "results": serializer_class(items, many=True, context=context or {"request": request}).data,
        }
    )


def m2(value):
    """Money as a string with exactly two decimals ("1290.00"), whatever the database returns."""
    from decimal import Decimal

    return f"{Decimal(value or 0):.2f}"
